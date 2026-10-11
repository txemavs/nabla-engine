import * as THREE from 'three'
import { weaponPresets, type WeaponPreset } from '../catalog/weapons/library.js'
import { assets, disposeObject } from '../render/entity/assets.js'
import {
  advanceFirearm,
  beginReload,
  freshFirearm,
  rounds,
  trigger,
  type FirearmEvent,
  type FirearmSpec,
  type FirearmState,
} from '../simulation/weapons/firearm.js'
import { MuzzleRise } from '../simulation/weapons/recoil.js'
import {
  pullTrigger,
  RecoilYaw,
  specForMode,
  type FireMode,
} from '../simulation/weapons/machine-pistol.js'
import { reloadPresentation } from './reload-presentation.js'
import {
  normalizeSidearmTuning,
  sidearmTuningDefaults,
  type SidearmTuning,
} from './sidearm-tuning.js'
import { MuzzleSmoke } from '../render/entity/muzzle-smoke.js'

/** Hip (default) and ADS viewmodel poses — centred for iron sights, no UI reticle. */
const HIP_POSE = { position: [0.1, -0.125, -0.34] as const, fov: 55 }
const ADS_POSE = { position: [0, -0.027, -0.2] as const, fov: 42 }

/** Presentation rig of an assembled model (`assets/rigs/weapons/*.rig.json`). */
interface WeaponRig {
  parts: { slide: string; trigger: string; magazine: string }
  presentation: {
    slide: { axis: number[]; travel: number }
    trigger: { axis: number[]; angle: number }
    magazine: { axis: number[]; distance: number }
  }
}
const defaultRig: WeaponRig = {
  parts: { slide: 'Slide', trigger: 'Trigger', magazine: 'Magazine' },
  presentation: {
    slide: { axis: [0, 0, 1], travel: 0.012 },
    trigger: { axis: [1, 0, 0], angle: 0.16 },
    magazine: { axis: [0, -1, 0], distance: 0.11 },
  },
}

/** Legacy behaviour for presets without real-firearm data: a fixed cadence, no ammunition. */
const legacyFirearm = (preset: WeaponPreset | undefined): FirearmSpec => ({
  magazineCapacity: Number.MAX_SAFE_INTEGER,
  chamber: 1,
  cycleMs: preset?.intervalMs ?? 220,
  reloadMs: { magazineOut: 1, magazineIn: 2, slideRelease: 3 },
})

interface Part {
  object: THREE.Object3D
  rest: THREE.Vector3
  restQuaternion: THREE.Quaternion
}

/**
 * The sidearm: firearm state (ammunition, trigger reset, slide lock, reload; `firearm.ts`), the
 * muzzle rise the shooter has to bring back down (`recoil.ts`), and the first-person viewmodel
 * that shows it (slide, trigger and magazine of the assembled model).
 */
export class Sidearm {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(HIP_POSE.fov, 1, 0.01, 5)
  readonly model = new THREE.Group()
  readonly preset: WeaponPreset | undefined
  /** The pistol's own (semi-automatic) spec; `firearm` follows the fire mode. */
  readonly baseFirearm: FirearmSpec
  private mode: FireMode = 'semi'
  readonly recoilYaw = new RecoilYaw()
  readonly state: FirearmState
  private readonly rise: MuzzleRise | null
  private rig: WeaponRig = defaultRig
  private slide: Part | null = null
  private triggerPart: Part | null = null
  private magazine: Part | null = null
  private worldPresentation: THREE.Group | null = null
  private tuning: SidearmTuning = { ...sidearmTuningDefaults }
  private readonly smoke = new MuzzleSmoke()
  private worldSmoke: MuzzleSmoke | null = null
  private assembledModel: THREE.Group | null = null
  private legacySlide: THREE.Object3D | null = null
  private readonly flash: THREE.Mesh
  private readonly flashAt: [number, number, number]
  private readonly laserLine: THREE.Line
  private enabled = false
  private disposed = false
  private aiming = false
  private aimBlend = 0
  private laserOn = false
  readonly range: number
  readonly impulse: number
  private readonly legacyTravel: number
  /** Settles once the assembled model has replaced the placeholder block (or failed to load). */
  readonly ready: Promise<void>

  constructor(_viewport: HTMLElement, preset: WeaponPreset | undefined = weaponPresets()[0]) {
    this.preset = preset
    this.range = preset?.ammunition?.maxTraceM ?? preset?.range ?? 150
    this.impulse = preset?.impulse ?? 12
    this.legacyTravel = preset?.slideTravel ?? 0
    this.baseFirearm = preset?.firearm
      ? {
          magazineCapacity: preset.firearm.magazineCapacity,
          chamber: preset.firearm.chamber,
          cycleMs: preset.firearm.cycleMs,
          reloadMs: preset.firearm.reloadMs,
        }
      : legacyFirearm(preset)
    this.state = freshFirearm(this.baseFirearm)
    this.rise = preset?.recoil ? new MuzzleRise(preset.recoil) : null
    const fallbackMaterial = new THREE.MeshStandardMaterial({ color: '#1b1f24', roughness: 0.6 })
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.17), fallbackMaterial)
    fallback.position.set(0, -0.05, -0.05)
    this.model.add(fallback)
    const dropFallback = () => {
      this.model.remove(fallback)
      fallback.geometry.dispose()
      fallbackMaterial.dispose()
    }
    let loading: Promise<unknown> = Promise.resolve()
    if (preset?.model) {
      const model = preset.model
      loading = Promise.all([assets.instantiate(model), preset.rig ? loadRig(preset.rig) : null])
        .then(([object, rig]) => {
          if (this.disposed) return disposeObject(object)
          if (rig) this.rig = rig
          const assembly = new THREE.Group()
          assembly.scale.setScalar(preset.scale)
          assembly.position.set(...preset.assembly)
          assembly.add(object)
          this.model.add(assembly)
          this.assembledModel = assembly
          this.slide = part(object, this.rig.parts.slide)
          this.triggerPart = part(object, this.rig.parts.trigger)
          this.magazine = part(object, this.rig.parts.magazine)
          dropFallback()
        })
        .catch(() => {
          /* the fallback block stays */
        })
    } else if (preset?.body) {
      const body = preset.body
      loading = Promise.all([
        assets.instantiate(body),
        preset.slide ? assets.instantiate(preset.slide) : Promise.resolve(null),
      ])
        .then(([bodyObject, slideObject]) => {
          if (this.disposed) {
            disposeObject(bodyObject)
            if (slideObject) disposeObject(slideObject)
            return
          }
          const assembly = new THREE.Group()
          assembly.scale.setScalar(preset.scale)
          assembly.position.set(...preset.assembly)
          assembly.add(bodyObject)
          if (slideObject) {
            assembly.add(slideObject)
            this.legacySlide = slideObject
          }
          this.model.add(assembly)
          this.assembledModel = assembly
          dropFallback()
        })
        .catch(() => {
          /* the fallback block stays */
        })
    }
    this.ready = loading.then(
      () => undefined,
      () => undefined,
    )
    this.flashAt = (preset?.flash.position ?? [0, 0, -0.135]) as [number, number, number]
    // A short, small, dim flash: in daylight a 9 mm shows little more than a blink.
    this.flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.012, 0.03, 6),
      new THREE.MeshBasicMaterial({
        color: '#ffd9a0',
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.flash.rotation.x = -Math.PI / 2
    this.flash.position.set(this.flashAt[0], this.flashAt[1], this.flashAt[2] - 0.015)
    this.flash.visible = false
    this.model.add(this.flash)
    this.model.add(this.smoke.root)
    const laserPositions = new Float32Array([
      this.flashAt[0],
      this.flashAt[1],
      this.flashAt[2],
      this.flashAt[0],
      this.flashAt[1],
      this.flashAt[2] - 2.5,
    ])
    this.laserLine = new THREE.Line(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.BufferAttribute(laserPositions, 3),
      ),
      new THREE.LineBasicMaterial({
        color: '#ff2a2a',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.laserLine.visible = false
    this.laserLine.frustumCulled = false
    this.model.add(this.laserLine)
    const key = new THREE.DirectionalLight('#ffffff', 2)
    key.position.set(-1, 2, 1)
    this.scene.add(key)
    this.scene.add(this.model, new THREE.HemisphereLight('#d3edff', '#27374f', 3))
  }

  /**
   * Prepare the viewmodel before it is first drawn: wait for the assembled model, upload its
   * textures and compile its programs (flash and laser included) against the viewmodel lights,
   * then draw it once off screen. The first draw then shows the pistol, not the placeholder.
   */
  async warm(renderer: THREE.WebGLRenderer): Promise<void> {
    await this.ready
    if (this.disposed) return
    const flash = this.flash.visible,
      laser = this.laserLine.visible
    this.flash.visible = true
    this.smoke.root.visible = true
    this.laserLine.visible = true
    try {
      this.scene.updateMatrixWorld(true)
      this.scene.traverse((object) => {
        const material = (object as THREE.Mesh).material
        for (const m of Array.isArray(material) ? material : material ? [material] : [])
          for (const value of Object.values(m))
            if (value instanceof THREE.Texture) renderer.initTexture(value)
      })
      await renderer.compileAsync(this.scene, this.camera)
      if (this.disposed) return
      const previous = renderer.getRenderTarget()
      const target = new THREE.WebGLRenderTarget(1, 1)
      try {
        renderer.setRenderTarget(target)
        renderer.render(this.scene, this.camera)
      } finally {
        renderer.setRenderTarget(previous)
        target.dispose()
      }
    } finally {
      this.flash.visible = flash
      this.smoke.root.visible = false
      this.laserLine.visible = laser
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.visible = false
    this.disposed = true
    this.smoke.dispose()
    this.worldSmoke?.dispose()
    this.worldPresentation?.removeFromParent()
    this.worldPresentation?.clear()
    this.worldPresentation = null
    disposeObject(this.model)
    this.model.clear()
    this.scene.clear()
  }

  set visible(value: boolean) {
    this.enabled = value && !this.disposed
    if (this.worldPresentation) this.worldPresentation.visible = this.enabled
    if (!this.enabled) {
      this.worldPresentation?.removeFromParent()
      this.aiming = false
      this.aimBlend = 0
      this.state.triggerHeld = false
    }
  }
  get visible(): boolean {
    return this.enabled
  }

  setAiming(value: boolean): void {
    this.aiming = value && this.enabled
  }
  get isAiming(): boolean {
    return this.aiming
  }

  /** Toggle the laser sight; returns the new state. */
  toggleLaser(): boolean {
    this.laserOn = !this.laserOn
    this.laserLine.visible = this.laserOn && this.enabled
    return this.laserOn
  }
  get laserEnabled(): boolean {
    return this.laserOn
  }

  /** Real-firearm data present (ammunition, reload, ballistics). */
  get simulated(): boolean {
    return !!this.preset?.firearm && !!this.preset.ammunition
  }

  /** Rounds on board (magazine + chamber), e.g. 13 + 1. */
  get ammo(): { magazine: number; chamber: number; seated: boolean; total: number } {
    return {
      magazine: this.state.magazine,
      chamber: this.state.chamber,
      seated: this.state.magazineSeated,
      total: rounds(this.state),
    }
  }

  reset(): void {
    Object.assign(this.state, freshFirearm(this.firearm))
    this.recoilYaw.reset()
    this.rise?.reset()
    this.aiming = false
    this.aimBlend = 0
  }

  /** Spec in use: the pistol's own, or the 30-round RÁFAGA one (`machine-pistol.ts`). */
  get firearm(): FirearmSpec {
    return specForMode(this.baseFirearm, this.mode)
  }
  get fireMode(): FireMode {
    return this.mode
  }
  /** Switch SEMI / RÁFAGA 30. A magazine fuller than the new capacity keeps only what fits. */
  setFireMode(mode: FireMode): void {
    this.mode = mode
    const capacity = this.firearm.magazineCapacity
    if (this.state.magazine > capacity) this.state.magazine = capacity
    this.state.triggerHeld = false
    this.recoilYaw.reset()
  }

  /** Trigger pressed or held: once per press in SEMI, at the cyclic rate in RÁFAGA. */
  pull(now: number): FirearmEvent {
    if (this.disposed || !Number.isFinite(now)) return trigger(this.state, this.firearm, false, 0)
    const event = pullTrigger(this.state, this.firearm, this.mode, true, now)
    if (event.fired) {
      this.smoke.burst(now, this.flashAt)
      if (this.worldPresentation?.visible) this.worldSmoke?.burst(now, this.flashAt)
      this.rise?.shot(now)
      if (this.mode === 'burst30') this.recoilYaw.kick()
    }
    return event
  }

  /** Trigger released: resets it for the next shot. */
  release(): void {
    trigger(this.state, this.firearm, false, 0)
  }

  /** Legacy API: a press immediately followed by a release; true when a shot went off. */
  fire(now: number): boolean {
    const fired = this.pull(now).fired
    this.release()
    return fired
  }

  reload(now: number): FirearmEvent {
    return beginReload(this.state, this.firearm, now)
  }

  /** Advance the slide and any reload; call once per frame. */
  update(now: number): FirearmEvent {
    return advanceFirearm(this.state, this.firearm, now)
  }

  /** Muzzle rise since the previous call (rad, positive = up), to add to the aim. */
  aimRise(now: number): number {
    return this.rise ? this.rise.step(now) : 0
  }

  impact(_hit: boolean): void {}

  /** Muzzle tip in the viewmodel camera's space (eye-relative), with the hip/ADS blend. */
  muzzleViewOffset(_now = 0): THREE.Vector3 {
    const pos = new THREE.Vector3(...HIP_POSE.position).lerp(
      new THREE.Vector3(ADS_POSE.position[0], this.tuning.height, ADS_POSE.position[2]),
      this.aimBlend,
    )
    return pos.add(
      new THREE.Vector3(...this.flashAt).applyAxisAngle(
        new THREE.Vector3(1, 0, 0),
        THREE.MathUtils.degToRad(this.tuning.angle) * this.aimBlend,
      ),
    )
  }

  /** Ejection port in the viewmodel camera's space: right of and behind the muzzle. */
  ejectionViewOffset(): THREE.Vector3 {
    return this.muzzleViewOffset().add(new THREE.Vector3(0.012, 0.01, 0.08))
  }

  render(renderer: THREE.WebGLRenderer, now: number, aspect: number, firstPerson: boolean): void {
    if (!this.enabled) return
    const height = renderer.getDrawingBufferSize(new THREE.Vector2()).y
    this.smoke.update(now, height)
    this.worldSmoke?.update(now, height)
    this.aimBlend += ((this.aiming ? 1 : 0) - this.aimBlend) * 0.28
    this.laserLine.visible = this.laserOn
    if (!firstPerson) return
    this.camera.aspect = aspect
    this.camera.fov = THREE.MathUtils.lerp(HIP_POSE.fov, ADS_POSE.fov, this.aimBlend)
    this.camera.updateProjectionMatrix()
    this.viewPose(now)
    const age = now - this.state.lastShotMs
    this.flash.visible = age >= 0 && age < 30
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    try {
      renderer.clearDepth()
      renderer.render(this.scene, this.camera)
    } finally {
      renderer.autoClear = autoClear
    }
  }

  /** Shared assembled asset on the avatar, including slide, trigger and magazine motion. */
  syncWorld(
    parent: THREE.Object3D,
    now: number,
    firstPerson: boolean,
    aim?: THREE.Vector3,
    up = new THREE.Vector3(0, 1, 0),
  ): void {
    if (!this.enabled || firstPerson || !this.assembledModel) {
      if (this.worldPresentation) this.worldPresentation.visible = false
      return
    }
    this.viewPose(now)
    if (!this.worldPresentation) {
      this.worldPresentation = new THREE.Group()
      this.worldPresentation.name = 'EquippedSidearm'
      this.worldPresentation.add(this.assembledModel.clone(true))
      this.worldSmoke = new MuzzleSmoke()
      this.worldPresentation.add(this.worldSmoke.root)
      this.worldPresentation.traverse((node) => {
        if (node instanceof THREE.Mesh) node.castShadow = true
      })
    }
    const world = this.worldPresentation
    if (world.parent !== parent) parent.add(world)
    world.visible = true
    world.position.set(
      0.24 + this.model.position.x - HIP_POSE.position[0],
      -0.16 + this.model.position.y - HIP_POSE.position[1],
      -0.32 + this.model.position.z - HIP_POSE.position[2],
    )
    world.quaternion.copy(this.model.quaternion)
    if (aim) {
      const rotation = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(world.getWorldPosition(new THREE.Vector3()), aim, up),
      )
      world.quaternion
        .copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert())
        .multiply(rotation)
      if (this.state.reload !== 'none') world.quaternion.multiply(this.model.quaternion)
    }
    for (const source of [this.slide, this.triggerPart, this.magazine]) {
      if (!source) continue
      const target = world.getObjectByName(source.object.name)
      if (!target) continue
      target.position.copy(source.object.position)
      target.quaternion.copy(source.object.quaternion)
      target.visible = source.object.visible
    }
  }

  worldMuzzle(): THREE.Vector3 | null {
    const world = this.worldPresentation
    return world?.visible ? world.localToWorld(new THREE.Vector3(...this.flashAt)) : null
  }

  worldMagazineDropView(): ReturnType<Sidearm['magazineDropView']> {
    const object = this.worldPresentation?.getObjectByName(this.rig.parts.magazine)
    if (!object || !this.worldPresentation?.visible) return null
    object.updateWorldMatrix(true, false)
    return {
      position: object.getWorldPosition(new THREE.Vector3()),
      quaternion: object.getWorldQuaternion(new THREE.Quaternion()),
      direction: axis(this.rig.presentation.magazine.axis).transformDirection(
        object.parent!.matrixWorld,
      ),
    }
  }

  private viewPose(now: number): void {
    this.model.position
      .set(...HIP_POSE.position)
      .lerp(
        new THREE.Vector3(ADS_POSE.position[0], this.tuning.height, ADS_POSE.position[2]),
        this.aimBlend,
      )
    this.model.rotation.set(0, 0, 0)
    this.pose(now)
  }

  /**
   * Magazine in the viewmodel camera's space, plus the direction it slides out of the grip.
   * Null until the assembled model has loaded.
   */
  magazineDropView(): {
    position: THREE.Vector3
    quaternion: THREE.Quaternion
    direction: THREE.Vector3
  } | null {
    if (!this.magazine) return null
    this.model.updateWorldMatrix(true, true)
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    this.magazine.object.getWorldPosition(position)
    this.magazine.object.getWorldQuaternion(quaternion)
    const parent = new THREE.Quaternion()
    this.magazine.object.parent?.getWorldQuaternion(parent)
    const direction = axis(this.rig.presentation.magazine.axis).applyQuaternion(parent)
    return { position, quaternion, direction }
  }

  /** A detached copy of the `Magazine` node. Geometry and materials stay shared. */
  magazineClone(): THREE.Object3D | null {
    return this.magazine ? this.magazine.object.clone(true) : null
  }

  /** Slide, trigger and magazine from the firearm state, relative to their rest poses. */
  private pose(now: number): void {
    const p = this.rig.presentation
    if (this.slide)
      this.slide.object.position
        .copy(this.slide.rest)
        .addScaledVector(axis(p.slide.axis), p.slide.travel * this.state.slide)
    if (this.legacySlide) this.legacySlide.position.z = this.state.slide * this.legacyTravel
    if (this.triggerPart)
      this.triggerPart.object.quaternion
        .copy(this.triggerPart.restQuaternion)
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            axis(p.trigger.axis),
            this.state.triggerHeld ? p.trigger.angle : 0,
          ),
        )
    const shown = reloadPresentation(
      this.state.reload,
      now - this.state.reloadStartMs,
      this.firearm.reloadMs,
    )
    // Positive X raises a muzzle facing -Z. Lift and cant the grip to show the magazine.
    this.model.rotation.set(
      shown.pitch + THREE.MathUtils.degToRad(this.tuning.angle) * this.aimBlend,
      shown.yaw,
      shown.roll,
    )
    this.model.position.y += shown.lift
    this.model.position.z -= shown.lift * 0.7
    this.model.position.x += shown.lift * 0.4
    if (this.magazine) {
      this.magazine.object.visible = shown.magazineVisible
      this.magazine.object.position
        .copy(this.magazine.rest)
        .addScaledVector(axis(p.magazine.axis), p.magazine.distance * shown.travel)
    }
  }

  /** Update the aimed presentation without altering shot direction or ballistics. */
  setTuning(patch: Partial<SidearmTuning>): void {
    this.tuning = normalizeSidearmTuning(patch, this.tuning)
  }
}

function part(root: THREE.Object3D, name: string): Part | null {
  const object = root.getObjectByName(name)
  return object
    ? { object, rest: object.position.clone(), restQuaternion: object.quaternion.clone() }
    : null
}

const axis = (v: number[]) => new THREE.Vector3(v[0], v[1], v[2]).normalize()

async function loadRig(url: string): Promise<WeaponRig | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const rig = (await response.json()) as Partial<WeaponRig>
    return {
      parts: { ...defaultRig.parts, ...rig.parts },
      presentation: { ...defaultRig.presentation, ...rig.presentation },
    }
  } catch {
    return null
  }
}
