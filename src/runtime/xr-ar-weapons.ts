import type { XRDisposalTest } from './xr-disposal-portal.js'
import { CasingMotion } from '../simulation/weapons/casings.js'
import { Casings } from '../render/entity/casings.js'
import type { Vec3Tuple } from '../entity/schema.js'
import { Vec3, type World } from '../simulation/physics.js'
import { XRItemContacts } from './xr-item-contacts.js'
import * as THREE from 'three'
import { VehicleAudio } from '../audio/vehicle.js'
import { ImpactMarks } from '../render/entity/impact-marks.js'
import { ShotSparks } from '../render/entity/shot-sparks.js'
import type { FirearmEvent } from '../simulation/weapons/firearm.js'
import { Sidearm } from './sidearm.js'
import { FirearmSamples } from '../audio/firearm-samples.js'
import type { WeaponPreset } from '../catalog/weapons/library.js'
import { XRLoadout } from './xr-loadout.js'
import type { GameXR } from './xr.js'
import type { GrabHand } from './xr-grab.js'

/** Small mixed-reality host for the same carried weapons used by the game. */
export class XRARWeapons {
  onHit?: (
    object: THREE.Object3D,
    point: THREE.Vector3,
    direction: THREE.Vector3,
  ) => boolean | void | { handled: boolean; glass?: boolean; metal?: boolean }
  physicsWorld: () => World | null = () => null
  readonly loadout: XRLoadout
  readonly ready: Promise<void>
  private readonly contacts = new XRItemContacts()
  private readonly audio = new VehicleAudio()
  private readonly samples = new Map<Sidearm, FirearmSamples>()
  private samplesFor(weapon: Sidearm): FirearmSamples {
    let samples = this.samples.get(weapon)
    if (!samples) this.samples.set(weapon, (samples = new FirearmSamples(this.audio)))
    return samples
  }
  private readonly impacts = new ImpactMarks()
  private readonly sparks = new ShotSparks()
  private casingMotion: CasingMotion | null = null
  private casingMeshes: Casings | null = null
  private readonly origin = new THREE.Vector3()
  private readonly ray = new THREE.Raycaster()

  disposalTest?: XRDisposalTest
  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly xr: GameXR,
    viewport: HTMLElement,
    initialPistols = 2,
    /** Extra firearm presets carried after the two default pistols (start absent). */
    extra: readonly WeaponPreset[] = [],
  ) {
    const weapons = [
      new Sidearm(viewport, undefined, 'low'),
      new Sidearm(viewport, undefined, 'low'),
      ...extra.map((preset) => new Sidearm(viewport, preset, 'low')),
    ]
    this.contacts.onContact = (point) => this.audio.weaponSound('prop-impact', point.toArray())
    this.loadout = new XRLoadout(scene, weapons, xr.calibration)
    for (const p of this.loadout.allPistols.slice(Math.max(0, Math.min(2, initialPistols))))
      this.loadout.removePistol(p)
    this.loadout.physicalPistols = true
    this.loadout.discardDropped = (root, dt) =>
      !!this.disposalTest && this.contacts.entersDisposal(root, this.disposalTest, dt)
    this.loadout.droppedPhysics = (root, velocity, angularVelocity) =>
      this.contacts.drop(root, velocity, this.physicsWorld(), angularVelocity)
    this.ready = Promise.all(weapons.map((w) => w.ready)).then(() => undefined)
    scene.add(this.sparks.root)
  }

  /** Pause audio without discarding placed objects or active grips. */
  setAudioActive(active: boolean): void {
    this.audio.setSuspended(!active)
  }
  unlock(): void {
    this.audio.unlock()
  }

  suspend(now: number): void {
    this.contacts.dispose()
    this.loadout.suspend(now)
    this.audio.setSuspended(true)
    this.sparks.root.visible = false
    this.impacts.clear()
    this.casingMotion?.reset()
    this.casingMeshes?.sync([])
  }

  tip(source: XRInputSource): THREE.Vector3 | null {
    return (
      this.loadout.pistols.find((p) => p.holder?.source === source)?.weapon.worldMuzzle() ?? null
    )
  }

  update(
    hands: readonly GrabHand[],
    now: number,
    dt: number,
    height: number,
    targets: THREE.Object3D[],
    ground?: (from: THREE.Vector3, distance: number) => THREE.Vector3 | null,
  ): void {
    this.audio.setSuspended(!this.xr.visible)
    this.audio.setListener(this.camera.position.toArray(), this.camera.quaternion.toArray())
    this.sparks.root.visible = this.xr.visible
    this.impacts.setLimit(this.xr.quality.impactLimit)
    this.sparks.enabled = this.xr.quality.sparks
    this.loadout.showVest = this.xr.quality.showVest
    const events = this.loadout.update(
      hands.filter((h) => this.loadout.occupied(h) || !this.xr.calibrationOwns(h.source)),
      this.camera,
      this.origin,
      now,
      dt,
      this.xr.visible,
      height,
      // local-floor supplies height zero; this is not room mesh detection.
      ground ??
        ((from, distance) =>
          from.y >= 0 && from.y <= distance ? new THREE.Vector3(from.x, 0, from.z) : null),
      (weapon) => this.audio.weaponSound('slide-back', weapon.worldMuzzle()?.toArray()),
    )
    this.contacts.retainDropped([
      ...this.loadout.cartridges.map((c) => c.root),
      ...this.loadout.magazines.filter((m) => !m.pocket).map((m) => m.root),
      ...this.loadout.pistols.filter((p) => p.dropped || p.holder).map((p) => p.holdMount),
    ])
    targets = [...targets, ...this.contacts.targets]
    const collide = (weapon: Sidearm) => {
      const points = ['GripSocket', 'MuzzleSocket']
        .map((name) => weapon.model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()))
        .filter((p): p is THREE.Vector3 => !!p)
      if (weapon.trackedMagazine)
        points.push(weapon.trackedMagazine.getWorldPosition(new THREE.Vector3()))
      this.contacts.resolve(weapon.model, points, this.physicsWorld(), now)
    }
    for (const item of this.loadout.magazines) {
      const model = item.root.children[0]
      if (item.holder && model)
        this.contacts.resolve(
          model,
          [model.getWorldPosition(new THREE.Vector3())],
          this.physicsWorld(),
          now,
        )
      else if (model) this.contacts.forget(model)
    }

    for (const pistol of this.loadout.pistols) {
      const weapon = pistol.weapon
      weapon.setSmokeEnabled(this.xr.quality.effects)
      const pending = [...events.get(weapon)!, weapon.update(now)]
      if (pistol.holder) collide(weapon)
      else this.contacts.forget(weapon.model)
      const down =
        this.xr.visible &&
        pistol.gripMode === 'handle' &&
        !!pistol.holder?.source?.gamepad?.buttons[0]?.pressed &&
        !this.loadout.slideHeld(pistol) &&
        !this.xr.calibrationOwns(pistol.holder?.source ?? null)
      if (!down) weapon.release()
      if (down && (!pistol.triggerDown || weapon.fireMode === 'burst30')) {
        // Sample the barrel before recoil moves the rendered weapon.
        const barrel = weapon.accessoryRay(now, false, this.camera.fov, 'Barrel')
        const shot = weapon.pull(now)
        pending.push(shot)
        if (shot.fired) {
          this.eject(weapon, false)
          this.samplesFor(weapon).shot(
            weapon.preset,
            barrel?.origin.toArray() ?? [0, 0, 0],
            weapon.fireMode === 'burst30',
            !!shot.locked,
          )
          if (barrel) {
            this.ray.set(barrel.origin, barrel.target.sub(barrel.origin).normalize())
            this.ray.far = weapon.range
            for (const target of targets) target.updateWorldMatrix(true, true)
            this.hitTargets(targets, now)
          }
        }
      }
      pistol.triggerDown = down
      const samples = this.samples.get(weapon)
      if (samples?.looping && (!down || weapon.state.chamber === 0))
        samples.release(weapon.worldMuzzle()?.toArray() ?? [0, 0, 0])
      for (const event of pending) {
        if (event.cartridgeEjected) this.eject(weapon, true)
        this.sound(event, weapon)
      }
      if (weapon.visible) {
        weapon.syncTracked(this.loadout.mount(pistol), now, height)
        if (pistol.holder) this.contacts.apply(weapon.model)
      }
      weapon.syncMuzzleLight(now, this.scene, this.camera, false)
    }
    for (const p of this.loadout.pistols)
      if (p.holder) this.contacts.trackHeld(p.holdMount, this.physicsWorld())
    for (const m of [...this.loadout.magazines, ...this.loadout.cartridges])
      if (m.holder) this.contacts.trackHeld(m.root, this.physicsWorld())
    this.sparks.update(now)
    this.loadout.updateLasers(now, this.camera.fov, (origin, direction, range) => {
      this.ray.set(origin, direction)
      this.ray.far = range
      for (const target of targets) target.updateWorldMatrix(true, true)
      return this.ray.intersectObjects(targets, false)[0]?.point ?? null
    })
    const cast = (from: Vec3Tuple, direction: Vec3Tuple, length: number) => {
      const world = this.physicsWorld()
      const end = from.map((v, i) => v + direction[i] * length) as Vec3Tuple
      // Room surfaces are native colliders; sweep includes them as well as engine Bodies.
      const hit = world?.sweepSphere(new Vec3(...from), new Vec3(...end), 0.001)
      if (!hit) return null
      const p = hit.point,
        n = hit.normal
      return { point: [p.x, p.y, p.z] as Vec3Tuple, normal: [n.x, n.y, n.z] as Vec3Tuple }
    }
    for (const [motion, meshes] of [[this.casingMotion, this.casingMeshes]] as const) {
      if (!motion || !meshes) continue
      motion.setLimit(this.xr.quality.casingLimit)
      if (this.xr.visible) {
        motion.update(dt, cast)
        for (const impact of motion.impacts.slice(0, 3))
          this.audio.casing(impact.speed, impact.position)
      }
      meshes.sync(motion.poses())
    }
  }

  /** Same ejection ports, motion and visual pools as desktop/VR. */
  private eject(weapon: Sidearm, cartridge: boolean): void {
    const spec = weapon.preset?.casing
    const pose = weapon.ejectionPose(false, this.camera.fov)
    if (!spec || !pose) return
    if (cartridge) {
      const item = this.loadout.addCartridge(weapon, pose.position)
      const launch = new CasingMotion(spec).eject(
        pose.position.toArray(),
        pose.right.toArray(),
        pose.up.toArray(),
      )
      if (item && launch) {
        item.velocity.fromArray(launch.velocity)
        item.angularVelocity.fromArray(launch.spin)
      }
      return
    }
    if (!this.casingMeshes) {
      this.casingMeshes = new Casings(spec.lengthM, spec.rimDiameterM)
      this.casingMotion = new CasingMotion(spec)
      this.scene.add(this.casingMeshes.root)
    }
    const motion = this.casingMotion
    motion!.setLimit(this.xr.quality.casingLimit)
    motion!.eject(pose.position.toArray(), pose.right.toArray(), pose.up.toArray())
  }

  private sound(event: FirearmEvent, weapon: Sidearm): void {
    const position = weapon.worldMuzzle()?.toArray()
    const samples = this.samplesFor(weapon)
    if (event.dry) samples.cue(weapon.preset, 'dry', position)
    if (event.magazineDropped) samples.cue(weapon.preset, 'magazine-out', position)
    if (event.magazineSeated) samples.cue(weapon.preset, 'magazine-in', position)
    if (event.slideReleased) samples.cue(weapon.preset, 'slide-forward', position)
    if (event.manualSlideLocked) this.audio.weaponSound('slide-lock', position)
  }

  private mobileWeapon?: Sidearm
  private readonly mobileMount = new THREE.Group()
  mobilePosition = new THREE.Vector2(0.18, -0.18)
  mobileTrigger = false
  private mobileDown = false
  async enableMobile(): Promise<void> {
    if (!this.mobileWeapon) {
      this.mobileWeapon = new Sidearm(document.body, undefined, 'low')
      this.scene.add(this.mobileMount)
    }
    await this.mobileWeapon.ready
    this.mobileWeapon.visible = true
    this.unlock()
  }
  reloadMobile(now: number): void {
    if (this.mobileWeapon) this.sound(this.mobileWeapon.reload(now, true), this.mobileWeapon)
  }
  updateMobile(now: number, targets: THREE.Object3D[]): void {
    const weapon = this.mobileWeapon
    if (!weapon?.visible) return
    this.mobileMount.visible = this.xr.visible
    const position = this.mobilePosition
    this.mobileMount.position
      .set(position.x, position.y, -0.5)
      .applyMatrix4(this.camera.matrixWorld)
    this.camera.getWorldDirection(this.ray.ray.direction)
    this.camera.getWorldPosition(this.ray.ray.origin)
    this.ray.far = weapon.range
    for (const target of targets) target.updateWorldMatrix(true, true)
    const aim =
      this.ray.intersectObjects(targets, false)[0]?.point ??
      this.ray.ray.at(weapon.range, new THREE.Vector3())
    this.mobileMount.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion)
    this.mobileMount.lookAt(aim)
    this.mobileMount.rotateY(Math.PI)
    weapon.setSmokeEnabled(this.xr.quality.effects)
    this.sound(weapon.update(now), weapon)
    weapon.syncTracked(this.mobileMount, now)
    const down = this.mobileTrigger && this.xr.visible
    if (!down) weapon.release()
    if (down && !this.mobileDown) {
      const shot = weapon.pull(now)
      this.sound(shot, weapon)
      if (shot.fired) {
        const muzzle = weapon.worldMuzzle() ?? this.mobileMount.position
        this.audio.gunshot(muzzle.toArray(), shot.locked)
        this.eject(weapon, false)
        // Aim at the centre, but cast from the muzzle so nearby obstacles still block the shot.
        this.ray.set(muzzle, aim.clone().sub(muzzle).normalize())
        this.hitTargets(targets, now)
      }
    }
    this.mobileDown = down
  }
  private hitTargets(targets: THREE.Object3D[], now: number): void {
    const hit = this.ray.intersectObjects(targets, false)[0]
    if (hit) {
      const response =
        this.contacts.hit(hit.object, hit.point, this.ray.ray.direction) ||
        this.onHit?.(hit.object, hit.point, this.ray.ray.direction)
      const handled = typeof response === 'object' ? response.handled : !!response
      const glass = typeof response === 'object' && !!response.glass
      if (glass) this.audio.destruction(hit.point.toArray(), true)
      else if (typeof response === 'object' && response.metal)
        this.audio.metalImpact(hit.point.toArray())
      const normal = (hit.face?.normal.clone() ?? new THREE.Vector3(0, 0, 1)).applyNormalMatrix(
        new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld),
      )
      if (normal.dot(this.ray.ray.direction) > 0) normal.negate()
      if (!glass)
        this.sparks.add(hit.point.toArray(), now, normal.toArray(), {
          surface: normal.y > 0.7 ? 'ground' : 'concrete',
        })
      if (!handled) this.impacts.addSurface(hit.object, hit.point.toArray(), normal.toArray())
    }
  }

  /**
   * Non-firearm hit (for example a melee swing) through the same impact path as a shot:
   * host onHit, sparks and marks. True when something within `distance` was hit.
   */
  strike(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number,
    targets: THREE.Object3D[],
    now: number,
  ): boolean {
    this.ray.set(origin, direction.clone().normalize())
    const far = this.ray.far
    this.ray.far = distance
    try {
      if (!this.ray.intersectObjects(targets, false).length) return false
      this.hitTargets(targets, now)
      return true
    } finally {
      this.ray.far = far
    }
  }

  dispose(): void {
    this.mobileWeapon?.dispose()
    this.mobileMount.removeFromParent()
    this.contacts.dispose()
    this.casingMeshes?.dispose()
    this.casingMeshes?.root.removeFromParent()
    this.loadout.dispose()
    for (const pistol of this.loadout.allPistols) pistol.weapon.dispose()
    this.impacts.dispose()
    this.sparks.dispose()
    this.sparks.root.removeFromParent()
    this.audio.dispose()
  }
}
