import * as THREE from 'three'
import { weaponPresets, type WeaponPreset } from '../catalog/weapons/library.js'
import { assets, disposeObject } from '../render/entity/assets.js'
import {
  advanceFirearm,
  beginReload,
  beginReloadAction,
  insertFreshMagazine,
  swapFreshMagazine,
  releaseSlide,
  moveSlide,
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
import { WeaponThermal } from '../simulation/weapons/weapon-thermal.js'
import { hkVariants, type HKVariantId } from '../simulation/weapons/hk-variants.js'
import {
  normalizeSidearmTuning,
  sidearmTuningDefaults,
  type SidearmTuning,
} from './sidearm-tuning.js'
import { MuzzleSmoke } from '../render/entity/muzzle-smoke.js'
import { poseHKDetails } from './hk-presentation.js'
import { ViewmodelLighting } from './viewmodel-lighting.js'
import { normalizeWeaponPoses, type WeaponPoseTuning } from './weapon-pose-tuning.js'

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
  poseTuning: WeaponPoseTuning = normalizeWeaponPoses()
  slidePosePreview = false
  private slidePoseBlend = 0
  private readonly viewRig = new THREE.Group()
  private readonly studioLights = new THREE.Group()
  private readonly worldLighting = new ViewmodelLighting()
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
  private chamberRound: THREE.Object3D | null = null
  private inspection: {
    kind: 'inspect' | 'chamber'
    start: number
    blend: number
    release?: number
  } | null = null
  private hammer: Part | null = null
  private lever: Part | null = null
  private slideLever: Part | null = null
  private magazineLever: Part | null = null
  private presentationNow = 0
  private decockPoseAt = -Infinity
  private slideLeverPoseAt = -Infinity
  private magazineLeverPoseAt = -Infinity
  private triggerPose = 0
  private hammerArmed = false
  private hammerStrikeAt = -Infinity
  private lastAction: 'single' | 'double' = 'double'
  readonly temperature = new WeaponThermal()
  private variantId: HKVariantId = 'sa-da-combined-left'
  private safetyOn = false
  private worldPresentation: THREE.Group | null = null
  private tuning: SidearmTuning = { ...sidearmTuningDefaults }
  private readonly smoke = new MuzzleSmoke()
  private worldSmoke: MuzzleSmoke | null = null
  private smokeEnabled = true
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
  private lightOn = false
  setLightEnabled(on: boolean): void {
    this.lightOn = on
  }
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
          this.chamberRound = object.getObjectByName('ChamberRound') ?? null
          poseHKDetails(object, 0, this.state.magazine)
          const accessory = object.getObjectByName('LightLaserModule')
          if (accessory) accessory.visible = false
          this.hammer = part(object, 'HammerPivot')
          this.lever = part(object, 'SafetyLeverPivot')
          this.slideLever = part(object, 'SlideReleasePivot')
          this.magazineLever = part(object, 'MagazineReleasePivot')
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
    this.studioLights.add(key, new THREE.HemisphereLight('#d3edff', '#27374f', 3))
    this.viewRig.add(this.model)
    this.scene.add(this.viewRig, this.studioLights, this.worldLighting.root)
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
    const accessory = this.assembledModel?.getObjectByName('LightLaserModule')
    const accessoryVisible = accessory?.visible ?? false
    if (accessory) accessory.visible = true
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
      if (accessory) accessory.visible = accessoryVisible
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
    this.laserLine.visible = false // The world beam alone supplies depth-tested surface termination.
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
    this.temperature.reset()
    this.inspection = null
    this.hammerArmed = false
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
  /** Fire mode never changes the ammunition inside an existing item. */
  setFireMode(mode: FireMode): void {
    this.mode = mode
    this.state.triggerHeld = false
    this.recoilYaw.reset()
  }

  /** Trigger pressed or held: once per press in SEMI, at the cyclic rate in RÁFAGA. */
  pull(now: number): FirearmEvent {
    if (
      this.inspection?.kind === 'chamber' &&
      (this.inspection.release === undefined || now - this.inspection.release < 300)
    )
      return trigger(this.state, this.firearm, false, now)
    this.inspection = null
    if (this.safetyOn) return trigger(this.state, this.firearm, false, now)
    if (this.disposed || !Number.isFinite(now)) return trigger(this.state, this.firearm, false, 0)
    const event = pullTrigger(this.state, this.firearm, this.mode, true, now)
    if (event.fired || event.dry) {
      this.hammerStrikeAt = now
      this.lastAction = this.hammerArmed ? 'single' : 'double'
      this.hammerArmed = !!event.fired && !this.variant.dao
    }
    if (event.fired) {
      this.temperature.shot(now)
      if (this.smokeEnabled) {
        this.smoke.burst(now, this.flashAt)
        if (this.worldPresentation?.visible) this.worldSmoke?.burst(now, this.flashAt)
      }
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
    const event = beginReload(this.state, this.firearm, now)
    if (event.reloadStarted) this.magazineLeverPoseAt = now
    return event
  }

  manipulate(action: 'magazine-out' | 'magazine-in' | 'slide-release', now: number): FirearmEvent {
    const event = beginReloadAction(this.state, this.firearm, action, now)
    if (event.reloadStarted && action === 'magazine-out') this.magazineLeverPoseAt = now
    return event
  }

  handleMagazine(action: 'drop' | 'insert' | 'release' | 'automatic', now: number): FirearmEvent {
    if (action === 'drop') return this.manipulate('magazine-out', now)
    if (action === 'insert' || action === 'automatic') {
      const spec = specForMode(this.baseFirearm, action === 'insert' ? 'semi' : 'burst30')
      const event =
        action === 'insert'
          ? insertFreshMagazine(this.state, spec, now)
          : swapFreshMagazine(this.state, spec, now)
      if (event.reloadStarted) {
        this.setFireMode(action === 'insert' ? 'semi' : 'burst30')
        this.magazineLeverPoseAt = now
      }
      return event
    }
    if (!this.state.slideLocked) return this.manipulate('slide-release', now)
    const event = releaseSlide(this.state, now)
    if (event.slideReleased) {
      this.hammerArmed = !this.variant.dao
      this.slideLeverPoseAt = now
    }
    return event
  }

  moveSlide(travel: number, now: number): FirearmEvent {
    if (this.state.reload !== 'none') return trigger(this.state, this.firearm, false, now)
    const event = moveSlide(this.state, this.firearm, travel, now)
    if (travel >= 0.75) this.hammerArmed = !this.variant.dao
    return event
  }

  /** Advance the slide and any reload; call once per frame. */
  update(now: number): FirearmEvent {
    this.temperature.step(now)
    const event = advanceFirearm(this.state, this.firearm, now)
    if (event.slideReleased) {
      this.hammerArmed = !this.variant.dao
      this.slideLeverPoseAt = now
    }
    return event
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
    if (this.chamberRound) {
      this.model.updateWorldMatrix(true, true)
      return this.viewRig.worldToLocal(this.chamberRound.getWorldPosition(new THREE.Vector3()))
    }
    return this.muzzleViewOffset().add(new THREE.Vector3(0.012, 0.01, 0.08))
  }

  render(
    renderer: THREE.WebGLRenderer,
    now: number,
    aspect: number,
    firstPerson: boolean,
    world?: THREE.Scene,
    eye?: THREE.Camera,
  ): void {
    if (!this.enabled) return
    const height = renderer.getDrawingBufferSize(new THREE.Vector2()).y
    this.smoke.update(now, height)
    this.worldSmoke?.update(now, height)
    this.aimBlend += ((this.aiming ? 1 : 0) - this.aimBlend) * 0.28
    this.laserLine.visible = false
    if (!firstPerson) return
    this.camera.aspect = aspect
    this.camera.fov = THREE.MathUtils.lerp(HIP_POSE.fov, ADS_POSE.fov, this.aimBlend)
    this.camera.updateProjectionMatrix()
    this.viewPose(now)
    this.studioLights.visible = !world
    this.worldLighting.root.visible = !!world
    if (world && eye) {
      this.worldLighting.sync(world)
      this.scene.environment = world.environment
      this.scene.environmentIntensity = world.environmentIntensity
      this.scene.environmentRotation.copy(world.environmentRotation)
      eye.updateWorldMatrix(true, false)
      eye.matrixWorld.decompose(this.viewRig.position, this.viewRig.quaternion, this.viewRig.scale)
      this.camera.position.copy(this.viewRig.position)
      this.camera.quaternion.copy(this.viewRig.quaternion)
      this.model.traverse((object) => {
        if (object instanceof THREE.Mesh) object.receiveShadow = true
      })
    } else {
      this.viewRig.position.set(0, 0, 0)
      this.viewRig.quaternion.identity()
      this.camera.position.set(0, 0, 0)
      this.camera.quaternion.identity()
    }
    const age = now - this.state.lastShotMs
    this.flash.visible = age >= 0 && age < 30
    const autoClear = renderer.autoClear
    const shadowUpdate = renderer.shadowMap.autoUpdate
    const shadowNeedsUpdate = renderer.shadowMap.needsUpdate
    renderer.autoClear = false
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = false
    try {
      renderer.clearDepth()
      renderer.render(this.scene, this.camera)
    } finally {
      renderer.autoClear = autoClear
      renderer.shadowMap.autoUpdate = shadowUpdate
      renderer.shadowMap.needsUpdate = shadowNeedsUpdate
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
      if (this.inspection) world.quaternion.multiply(this.model.quaternion)
    }
    for (const source of [
      this.slide,
      this.triggerPart,
      this.magazine,
      this.hammer,
      this.lever,
      this.slideLever,
      this.magazineLever,
    ]) {
      if (!source) continue
      const target = world.getObjectByName(source.object.name)
      if (!target) continue
      target.position.copy(source.object.position)
      target.quaternion.copy(source.object.quaternion)
      target.visible = source.object.visible
      target.scale.copy(source.object.scale)
    }
    const cartridge = world.getObjectByName('ChamberRound')
    if (cartridge && this.chamberRound) cartridge.visible = this.chamberRound.visible
    poseHKDetails(
      world,
      (this.slide?.object.position.z ?? 0) / this.rig.presentation.slide.travel,
      this.state.reload === 'magazine-in'
        ? (this.state.pendingMagazine?.rounds ?? 0)
        : this.state.magazine,
      (this.state.reload === 'magazine-in' ? this.state.pendingMagazine : this.state.magazineEntity)
        ?.capacity ?? 13,
    )
    for (const name of ['Hammer', 'HammerDAO', 'Control_lever', 'LightLaserModule']) {
      const source = this.assembledModel?.getObjectByName(name)
      const target = world.getObjectByName(name)
      if (source && target) {
        target.visible = source.visible
        target.scale.copy(source.scale)
      }
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
    this.viewRig.worldToLocal(position)
    const inverse = this.viewRig.getWorldQuaternion(new THREE.Quaternion()).invert()
    quaternion.premultiply(inverse)
    direction.applyQuaternion(inverse)
    return { position, quaternion, direction }
  }

  cartridgeClone(): THREE.Object3D | null {
    return this.chamberRound?.clone(true) ?? null
  }

  /** A detached copy of the `Magazine` node. Geometry and materials stay shared. */
  magazineClone(): THREE.Object3D | null {
    const clone = this.magazine?.object.clone(true) ?? null
    const top = clone?.getObjectByName('MagazineTopRound')
    if (top) top.visible = false // World presentation binds the actual dropped entity.
    return clone
  }

  /** Slide, trigger and magazine from the firearm state, relative to their rest poses. */
  private pose(now: number): void {
    const accessory = this.assembledModel?.getObjectByName('LightLaserModule')
    if (accessory) accessory.visible = this.laserOn || this.lightOn
    const elapsed = Math.max(0, Math.min(100, now - this.presentationNow))
    this.presentationNow = now
    const p = this.rig.presentation
    const targetTrigger = this.state.triggerHeld
      ? p.trigger.angle * (this.lastAction === 'double' ? 1 : 0.45)
      : 0
    this.triggerPose += (targetTrigger - this.triggerPose) * (1 - Math.exp(-elapsed / 28))
    if (this.slide)
      this.slide.object.position
        .copy(this.slide.rest)
        .addScaledVector(axis(p.slide.axis), p.slide.travel * this.state.slide)
    if (this.legacySlide) this.legacySlide.position.z = this.state.slide * this.legacyTravel
    if (this.triggerPart)
      this.triggerPart.object.quaternion
        .copy(this.triggerPart.restQuaternion)
        .multiply(new THREE.Quaternion().setFromAxisAngle(axis(p.trigger.axis), this.triggerPose))
    const shown = reloadPresentation(
      this.state.reloadAction === 'slide-release' ? 'none' : this.state.reload,
      now - this.state.reloadStartMs,
      this.firearm.reloadMs,
    )
    // Magazine/slide actions animate their own parts, independently of the viewing posture.
    this.model.rotation.set(THREE.MathUtils.degToRad(this.tuning.angle) * this.aimBlend, 0, 0)
    if (this.magazine) {
      this.magazine.object.visible =
        this.state.reload === 'none' ? this.state.magazineSeated : shown.magazineVisible
      this.magazine.object.position
        .copy(this.magazine.rest)
        .addScaledVector(axis(p.magazine.axis), p.magazine.distance * shown.travel)
    }
    if (this.chamberRound) this.chamberRound.visible = this.state.chamber > 0
    if (this.hammer) {
      const age = now - this.hammerStrikeAt
      const strike = age >= 0 && age < 55 ? 0.7 * (1 - age / 55) : 0
      const recock = this.hammerArmed ? 0.7 * Math.max(0, Math.min(1, (age - 55) / 65)) : 0
      this.hammer.object.rotation.x = Math.max(strike, recock, this.state.slide * 0.7)
    }
    const originalHammer = this.hammer?.object.getObjectByName('Hammer')
    const bobbedHammer = this.hammer?.object.getObjectByName('HammerDAO')
    if (originalHammer) originalHammer.visible = !this.variant.dao || !bobbedHammer
    if (bobbedHammer) bobbedHammer.visible = this.variant.dao
    if (this.lever) {
      this.lever.object.visible = this.variant.side !== 'none'
      this.lever.object.scale.x = this.variant.side === 'right' ? -1 : 1
      const pulse = Math.max(0, 1 - (now - this.decockPoseAt) / 280)
      const target = this.safetyOn ? -0.24 : pulse * 0.3
      this.lever.object.rotation.x +=
        (target - this.lever.object.rotation.x) * (1 - Math.exp(-elapsed / 65))
    }
    if (this.slideLever) {
      const pulse = Math.max(0, 1 - (now - this.slideLeverPoseAt) / 240)
      const target = this.state.slideLocked ? -0.15 : pulse * 0.17
      this.slideLever.object.rotation.x +=
        (target - this.slideLever.object.rotation.x) * (1 - Math.exp(-elapsed / 45))
    }
    if (this.magazineLever) {
      const age = now - this.magazineLeverPoseAt
      const press = age >= 0 && age < 300 ? Math.sin((Math.PI * age) / 300) : 0
      this.magazineLever.object.rotation.x = press * -0.25
    }
    if (this.inspection) {
      const held = this.inspection.release === undefined
      this.inspection.blend +=
        ((held ? 1 : 0) - this.inspection.blend) * (1 - Math.exp(-elapsed / 90))
      const blend = this.inspection.blend
      if (!held && blend < 0.001) this.inspection = null
      else {
        if (this.inspection.kind === 'chamber') {
          this.model.rotation.x += (0.85 - this.model.rotation.x) * blend
          this.model.rotation.y += (0 - this.model.rotation.y) * blend
          this.model.rotation.z += (0.22 - this.model.rotation.z) * blend
          if (this.slide) {
            const travel = Math.max(this.state.slide, 0.8 * blend)
            this.slide.object.position
              .copy(this.slide.rest)
              .addScaledVector(axis(p.slide.axis), p.slide.travel * travel)
          }
        } else {
          this.model.rotation.y += blend * 0.9
          this.model.rotation.z += blend * -0.35
          this.model.position.y += blend * 0.055
        }
      }
    }
    const slideActive =
      this.slidePosePreview ||
      (this.state.reloadAction === 'slide-release' && this.state.reload !== 'none')
    this.slidePoseBlend +=
      ((slideActive ? 1 : 0) - this.slidePoseBlend) * (1 - Math.exp(-elapsed / 70))
    const slidePose = this.poseTuning.slide,
      slideAimed = this.poseTuning.slideAimed
    const base = this.poseTuning.normal,
      aimed = this.poseTuning.aimed
    const pair =
      this.inspection?.kind === 'chamber'
        ? [this.poseTuning.chamber, this.poseTuning.chamberAimed]
        : [this.poseTuning.inspect, this.poseTuning.inspectAimed]
    const inspectionBlend = this.inspection?.blend ?? 0
    for (const axis of ['x', 'y', 'z'] as const) {
      const normal = THREE.MathUtils.lerp(base[axis], aimed[axis], this.aimBlend)
      const inspected = THREE.MathUtils.lerp(pair[0][axis], pair[1][axis], this.aimBlend)
      this.model.position[axis] +=
        (THREE.MathUtils.lerp(normal, inspected, inspectionBlend) +
          THREE.MathUtils.lerp(slidePose[axis], slideAimed[axis], this.aimBlend) *
            this.slidePoseBlend) /
        1000
    }
    for (const [axis, rotation] of [
      ['pitch', 'x'],
      ['yaw', 'y'],
      ['roll', 'z'],
    ] as const) {
      const normalAngle = THREE.MathUtils.lerp(base[axis], aimed[axis], this.aimBlend)
      const inspectedAngle = THREE.MathUtils.lerp(pair[0][axis], pair[1][axis], this.aimBlend)
      this.model.rotation[rotation] += THREE.MathUtils.degToRad(
        THREE.MathUtils.lerp(normalAngle, inspectedAngle, inspectionBlend) +
          THREE.MathUtils.lerp(slidePose[axis], slideAimed[axis], this.aimBlend) *
            this.slidePoseBlend,
      )
    }
    if (this.assembledModel)
      poseHKDetails(
        this.assembledModel,
        (this.slide?.object.position.z ?? 0) / p.slide.travel,
        this.state.reload === 'magazine-in'
          ? (this.state.pendingMagazine?.rounds ?? 0)
          : this.state.magazine,
        (this.state.reload === 'magazine-in'
          ? this.state.pendingMagazine
          : this.state.magazineEntity
        )?.capacity ?? 13,
      )
  }

  /** Cosmetic inspection only: it never consumes or ejects ammunition. */
  inspect(now: number, chamber = false): void {
    const kind = chamber ? 'chamber' : 'inspect'
    const blend = this.inspection?.kind === kind ? this.inspection.blend : 0
    this.inspection = { kind, start: now, blend }
  }
  stopInspect(now: number): void {
    if (this.inspection && this.inspection.release === undefined) this.inspection.release = now
  }
  get triggerAction(): 'single' | 'double' {
    return this.hammerArmed ? 'single' : 'double'
  }
  /** Gameplay hammer state, with no discharge or ammunition change. */
  decock(): void {
    if (this.variant.decocker) {
      this.decockPoseAt = this.presentationNow
      this.hammerArmed = false
      this.release()
    }
  }
  cock(): void {
    if (!this.variant.dao) this.hammerArmed = true
  }
  get variant() {
    return hkVariants.find((variant) => variant.id === this.variantId)!
  }
  setVariant(id: HKVariantId): void {
    if (!hkVariants.some((v) => v.id === id)) return
    this.variantId = id
    this.safetyOn = false
    this.hammerArmed = false
    this.release()
  }
  setSafety(on: boolean): void {
    this.safetyOn = on && this.variant.safety
    if (this.safetyOn) this.release()
  }
  get safe(): boolean {
    return this.safetyOn
  }
  /** Initialise an exercise without generating fake shots or heating the weapon. */
  setTrainingLoad(magazine: number, chamber: 0 | 1): void {
    Object.assign(this.state, freshFirearm(this.firearm))
    this.state.magazine = Math.max(0, Math.min(this.firearm.magazineCapacity, Math.floor(magazine)))
    this.state.chamber = chamber
    this.state.slideLocked = this.state.magazine === 0 && chamber === 0
    this.hammerArmed = !this.variant.dao && this.state.slideLocked
    this.inspection = null
  }

  /** Update the aimed presentation without altering shot direction or ballistics. */
  setTuning(patch: Partial<SidearmTuning>): void {
    this.tuning = normalizeSidearmTuning(patch, this.tuning)
  }
  setSmokeEnabled(enabled: boolean): void {
    if (this.smokeEnabled === enabled) return
    this.smokeEnabled = enabled
    if (!enabled) {
      this.smoke.clear()
      this.worldSmoke?.clear()
    }
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
