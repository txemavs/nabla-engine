import { ShotLaser } from '../render/entity/shot-laser.js'
import { XRObjectGrab } from './xr-object-grab.js'
import { XRBodyAnchor } from './xr-body-anchor.js'
import { XRCalibration } from './xr-calibration.js'
import * as THREE from 'three'
import type { Sidearm } from './sidearm.js'
import type { GrabHand } from './xr-grab.js'
import type { FirearmEvent } from '../simulation/weapons/firearm.js'
import { createMagazine, type MagazineEntity } from '../simulation/weapons/magazine.js'
import { poseMagazineCapacity } from '../render/entity/magazine-shape.js'

const position = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())
const squeezed = (h: GrabHand) =>
  !!h.source?.gamepad?.buttons[1]?.pressed || (h.source?.gamepad?.buttons[1]?.value ?? 0) > 0.6
export interface CarriedPistol {
  weapon: Sidearm
  holster: THREE.Group
  adjustment: THREE.Group
  holder: GrabHand | null
  triggerDown: boolean
  holdMount: THREE.Group
  grab: XRObjectGrab
}
interface MagazineItem {
  entity: MagazineEntity
  root: THREE.Group
  holder: GrabHand | null
  pocket: THREE.Group | null
  velocity: THREE.Vector3
  angularVelocity: THREE.Vector3
  grab: XRObjectGrab
  previous: THREE.Vector3
}
interface MagazinePull {
  pistol: CarriedPistol
  hand: GrabHand
  start: THREE.Vector3
  axis: THREE.Vector3
}
interface SlideHold {
  pistol: CarriedPistol
  hand: GrabHand
  start: THREE.Vector3
  travel: number
}

/** Body inventory and exclusive, hold-to-grab hand ownership. Magazine entities never respawn. */
export class XRLoadout {
  /** Host may delegate loose inventory to the same engine physics world as the room. */
  droppedPhysics?: (
    root: THREE.Object3D,
    velocity: THREE.Vector3,
    angularVelocity: THREE.Vector3,
  ) => boolean
  readonly body = new THREE.Group()
  readonly loose = new THREE.Group()
  private readonly lasers: ShotLaser[] = []
  private readonly laserTouches = new Set<CarriedPistol>()
  readonly pistols: CarriedPistol[]
  readonly pockets: THREE.Group[] = []
  readonly magazines: MagazineItem[] = []
  private readonly bodyAnchor = new XRBodyAnchor()
  private slides: SlideHold[] = []
  private pulls: MagazinePull[] = []
  private supports = new Map<CarriedPistol, GrabHand>()
  private insertions = new Map<MagazineItem, { pistol: CarriedPistol; start: THREE.Vector3 }>()
  private held = new Set<XRInputSource>()
  private origin = new THREE.Vector3()
  private geometry = new THREE.BoxGeometry(0.07, 0.09, 0.035)
  private material = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.9 })

  constructor(
    scene: THREE.Scene,
    weapons: Sidearm[],
    readonly calibration = new XRCalibration(),
  ) {
    scene.add(this.body, this.loose)
    this.pistols = weapons.map((weapon, i) => {
      const holster = new THREE.Group()
      holster.position.set(i === 0 ? -0.25 : 0.25, -0.57, -0.08)
      holster.rotation.x = Math.PI
      this.body.add(holster)
      const pouch = new THREE.Mesh(this.geometry, this.material)
      pouch.position.copy(holster.position).add(new THREE.Vector3(0, -0.05, 0.025))
      holster.attach(pouch)
      const adjustment = new THREE.Group()
      holster.add(adjustment)
      const holdMount = new THREE.Group()
      this.loose.add(holdMount)
      return {
        weapon,
        holster,
        adjustment,
        holder: null,
        triggerDown: false,
        holdMount,
        grab: new XRObjectGrab(),
      }
    })
    for (const _pistol of this.pistols) {
      const laser = new ShotLaser()
      this.lasers.push(laser)
      scene.add(laser.root)
    }
    for (const x of [-0.14, 0.14]) {
      const pocket = new THREE.Group()
      pocket.position.set(x, -0.3, -0.24)
      this.body.add(pocket)
      this.pockets.push(pocket)
      const pouch = new THREE.Mesh(this.geometry, this.material)
      pouch.position.copy(pocket.position).add(new THREE.Vector3(0, -0.04, 0.025))
      pocket.attach(pouch)
    }
    this.body.visible = this.loose.visible = false
  }

  occupied(hand: GrabHand): boolean {
    return (
      this.pistols.some((p) => p.holder === hand) ||
      this.magazines.some((m) => m.grab.hands.includes(hand.grip)) ||
      this.slides.some((s) => s.hand === hand) ||
      this.pulls.some((p) => p.hand === hand) ||
      [...this.supports.values()].includes(hand)
    )
  }
  supported(pistol: CarriedPistol): boolean {
    return this.supports.has(pistol)
  }
  slideHeld(pistol: CarriedPistol): boolean {
    return this.slides.some((s) => s.pistol === pistol)
  }
  mount(pistol: CarriedPistol): THREE.Group {
    // The holstered pose never travels into a hand: each hand has its own calibrated mount.
    return pistol.holder ? pistol.holdMount : pistol.adjustment
  }

  /** Same engine sight and weapon state as desktop; only the scene-query adapter differs. */
  updateLasers(
    now: number,
    fov: number,
    cast: (origin: THREE.Vector3, direction: THREE.Vector3, range: number) => THREE.Vector3 | null,
  ): void {
    for (const [index, pistol] of this.pistols.entries()) {
      const weapon = pistol.weapon,
        laser = this.lasers[index]
      laser.enabled = !!pistol.holder && weapon.visible && weapon.laserEnabled
      if (!laser.enabled) continue
      const ray = weapon.accessoryRay(now, false, fov, 'RedLaserSocket')
      if (!ray) {
        laser.enabled = false
        continue
      }
      const direction = ray.target.sub(ray.origin).normalize()
      const hit = cast(ray.origin, direction, weapon.range)
      laser.set(
        ray.origin.toArray(),
        (hit ?? ray.origin.clone().addScaledVector(direction, weapon.range)).toArray(),
        !!hit,
      )
    }
  }

  private touchLasers(hands: readonly GrabHand[]): void {
    for (const pistol of this.pistols) {
      const muzzle = pistol.holder ? pistol.weapon.worldMuzzle?.() : null
      const radius = this.laserTouches.has(pistol) ? 0.055 : 0.03
      const hand =
        muzzle &&
        hands.find(
          (h) =>
            h !== pistol.holder &&
            !this.occupied(h) &&
            !squeezed(h) &&
            h.visual &&
            h.visual.indexTip.getWorldPosition(new THREE.Vector3()).distanceTo(muzzle) <= radius,
        )
      if (hand) {
        if (!this.laserTouches.has(pistol)) {
          pistol.weapon.toggleLaser()
          void hand.source?.gamepad?.hapticActuators?.[0]?.pulse(0.15, 25).catch(() => {})
        }
        this.laserTouches.add(pistol)
      } else this.laserTouches.delete(pistol)
    }
  }

  suspend(now: number): void {
    this.bodyAnchor.reset()
    this.laserTouches.clear()
    for (const laser of this.lasers) laser.enabled = false
    for (const slide of this.slides) slide.pistol.weapon.moveSlide(0, now)
    this.slides = []
    this.pulls = []
    this.supports.clear()
    this.insertions.clear()
    for (const pistol of this.pistols) {
      pistol.holder = null
      pistol.grab.reset()
      pistol.triggerDown = false
      pistol.weapon.release()
      pistol.weapon.visible = false
      pistol.weapon.model.visible = false
    }
    for (const item of this.magazines) {
      if (item.holder) {
        this.loose.attach(item.root)
        item.holder = null
        item.grab.reset()
        item.angularVelocity.set(0, 0, 0)
        item.velocity.set(0, 0, 0)
      }
    }
    this.held.clear()
    this.body.visible = this.loose.visible = false
  }
  dispose(): void {
    this.suspend(performance.now())
    for (const laser of this.lasers) laser.dispose()
    this.body.removeFromParent()
    this.loose.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }

  private item(weapon: Sidearm, entity: MagazineEntity): MagazineItem | null {
    const model = weapon.magazineClone()
    if (!model) return null
    model.visible = true
    model.position.set(0, 0, 0)
    model.quaternion.identity()
    weapon.trackedMagazine?.getWorldScale(model.scale)
    poseMagazineCapacity(model, entity.capacity)
    const top = model.getObjectByName('MagazineTopRound')
    if (top) top.visible = entity.rounds > 0
    const root = new THREE.Group()
    root.add(model)
    this.loose.add(root)
    const item = {
      entity,
      root,
      holder: null,
      pocket: null,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      grab: new XRObjectGrab(),
      previous: new THREE.Vector3(),
    }
    this.magazines.push(item)
    return item
  }

  update(
    hands: readonly GrabHand[],
    camera: THREE.Camera,
    origin: THREE.Vector3,
    now: number,
    dt: number,
    enabled: boolean,
    height: number,
    ground: (from: THREE.Vector3, distance: number) => THREE.Vector3 | null,
    slideSound: (weapon: Sidearm) => void,
  ): Map<Sidearm, FirearmEvent[]> {
    const events = new Map(this.pistols.map((p) => [p.weapon, [] as FirearmEvent[]]))
    const emit = (p: CarriedPistol, e: FirearmEvent) => events.get(p.weapon)!.push(e)
    const shift = this.origin.clone().sub(origin)
    for (const m of this.magazines) if (!m.holder && !m.pocket) m.root.position.add(shift)
    for (const m of this.magazines) m.grab.shiftOrigin(shift)
    for (const p of this.pistols) p.grab.shiftOrigin(shift)
    this.origin.copy(origin)
    if (!enabled) {
      this.suspend(now)
      return events
    }
    this.body.visible = this.loose.visible = true
    this.bodyAnchor.update(this.body, camera, dt)
    this.pistols.forEach((p, i) => {
      this.calibration.apply(p.holster, i === 0 ? 'holster-0' : 'holster-1')
      this.calibration.apply(p.adjustment, i === 0 ? 'pistol-0' : 'pistol-1')
    })
    this.pockets.forEach((p, i) => this.calibration.apply(p, i === 0 ? 'pocket-0' : 'pocket-1'))
    this.body.updateWorldMatrix(true, true)
    for (const p of this.pistols) {
      p.weapon.visible = true
      p.weapon.syncTracked(this.mount(p), now, height)
    }
    if (this.pistols[0]?.weapon.trackedMagazine) {
      for (let i = 0; i < 2; i++) {
        if (this.magazines.some((m) => m.pocket === this.pockets[i])) continue
        const m = this.item(this.pistols[0].weapon, createMagazine(i === 0 ? 13 : 30))!
        this.pockets[i].add(m.root)
        m.pocket = this.pockets[i]
      }
    }
    for (const item of this.magazines) {
      this.calibration.apply(
        item.root.children[0],
        item.entity.capacity > 13 ? 'magazine-long' : 'magazine-normal',
      )
      item.root.updateWorldMatrix(true, true)
    }
    for (const p of this.pistols)
      if (p.holder && (!hands.includes(p.holder) || !squeezed(p.holder))) p.holder = null
    for (const s of [...this.slides]) {
      if (!s.pistol.holder || !hands.includes(s.hand) || !squeezed(s.hand)) {
        emit(s.pistol, s.pistol.weapon.moveSlide(0, now))
        this.slides.splice(this.slides.indexOf(s), 1)
      }
    }
    for (const m of [...this.magazines]) {
      if (!m.holder) continue
      const grips = m.grab.hands.filter((grip) => hands.some((h) => h.grip === grip && squeezed(h)))
      const tracked = m.grab.hands.every((grip) => hands.some((h) => h.grip === grip))
      const released = m.grab.update(m.root, grips, tracked ? dt : 0.2)
      m.holder = hands.find((h) => h.grip === grips[0]) ?? null
      m.velocity.copy(m.grab.velocity)
      m.angularVelocity.copy(m.grab.angularVelocity)
      if (released) {
        const here = position(m.root.children[0])
        const pocket = this.pockets.find(
          (p) =>
            position(p).distanceTo(here) < 0.12 &&
            !this.magazines.some((other) => other !== m && other.pocket === p),
        )
        if (pocket) {
          pocket.add(m.root)
          m.root.position.set(0, 0, 0)
          m.root.quaternion.identity()
          m.pocket = pocket
          m.velocity.set(0, 0, 0)
          m.angularVelocity.set(0, 0, 0)
        }
      }
    }
    for (const [p, hand] of this.supports) {
      if (!p.holder || !hands.includes(hand) || !squeezed(hand)) {
        if (!p.holder && hands.includes(hand) && squeezed(hand)) p.holder = hand
        this.supports.delete(p)
      }
    }
    for (const pull of [...this.pulls]) {
      const { pistol: p, hand } = pull
      if (!p.holder || !hands.includes(hand) || !squeezed(hand)) {
        this.pulls.splice(this.pulls.indexOf(pull), 1)
        continue
      }
      const local = p.weapon.model.worldToLocal(position(hand.grip))
      if (
        local
          .sub(pull.start)
          .applyMatrix3(new THREE.Matrix3().setFromMatrix4(p.weapon.model.matrixWorld))
          .dot(pull.axis.clone().transformDirection(p.weapon.model.matrixWorld)) < 0.04
      )
        continue
      const pose = p.weapon.worldMagazineDropView(),
        entity = p.weapon.state.magazineEntity
      this.pulls.splice(this.pulls.indexOf(pull), 1)
      if (!pose || !entity) continue
      const m = this.item(p.weapon, entity)
      if (!m) continue
      const event = p.weapon.takeMagazine()
      if (!event.magazineDropped) {
        m.root.removeFromParent()
        this.magazines.splice(this.magazines.indexOf(m), 1)
        continue
      }
      m.root.position.copy(pose.position).addScaledVector(pose.direction, 0.04)
      m.root.quaternion.copy(pose.quaternion)
      m.grab.update(m.root, [hand.grip], 0)
      m.holder = hand
      m.previous.copy(position(m.root.children[0]))
      emit(p, { ...event, droppedMagazine: undefined })
    }
    // Seat only after moving along the magazine well toward the weapon, while gripping.
    for (const m of this.magazines) {
      if (!m.holder) {
        this.insertions.delete(m)
        continue
      }
      const target = this.pistols.find(
        (p) =>
          p.holder &&
          p.holder !== m.holder &&
          !p.weapon.state.magazineSeated &&
          p.weapon.trackedMagazine &&
          position(p.weapon.trackedMagazine).distanceTo(position(m.root.children[0])) < 0.16,
      )
      if (!target) {
        this.insertions.delete(m)
        continue
      }
      const local = target.weapon.model.worldToLocal(position(m.root.children[0]))
      const pending = this.insertions.get(m)
      if (!pending || pending.pistol !== target) {
        this.insertions.set(m, { pistol: target, start: local })
        continue
      }
      const pose = target.weapon.worldMagazineDropView()
      if (!pose) continue
      const axis = pose.direction
        .clone()
        .transformDirection(new THREE.Matrix4().copy(target.weapon.model.matrixWorld).invert())
      const close =
        position(target.weapon.trackedMagazine!).distanceTo(position(m.root.children[0])) < 0.09
      if (
        close &&
        local
          .clone()
          .sub(pending.start)
          .applyMatrix3(new THREE.Matrix3().setFromMatrix4(target.weapon.model.matrixWorld))
          .dot(axis.clone().transformDirection(target.weapon.model.matrixWorld)) < -0.025
      ) {
        const event = target.weapon.seatMagazine(m.entity)
        emit(target, event)
        if (event.magazineSeated) {
          m.root.removeFromParent()
          m.holder = null
          this.magazines.splice(this.magazines.indexOf(m), 1)
          this.insertions.delete(m)
        }
      }
    }
    for (const h of hands) {
      if (!squeezed(h) || this.held.has(h.source!) || this.occupied(h)) continue
      const handPosition = position(h.grip)
      const candidates: { distance: number; grab: () => void }[] = []
      const candidate = (point: THREE.Vector3, radius: number, grab: () => void) => {
        const distance = point.distanceTo(handPosition)
        if (distance <= radius) candidates.push({ distance, grab })
      }
      for (const m of this.magazines)
        if (!m.grab.hands.includes(h.grip) && m.grab.hands.length < 2)
          candidate(position(m.root.children[0]), 0.12, () => {
            this.loose.attach(m.root)
            m.grab.update(m.root, [...m.grab.hands, h.grip], 0)
            m.holder = hands.find((hand) => hand.grip === m.grab.hands[0]) ?? h
            m.pocket = null
            m.previous.copy(position(m.root.children[0]))
            m.velocity.set(0, 0, 0)
          })
      for (const p of this.pistols) {
        if (!p.holder) {
          const socket = p.weapon.model.getObjectByName('GripSocket')
          if (socket)
            candidate(position(socket), 0.16, () => {
              p.holder = h
            })
          continue
        }
        const mag = p.weapon.trackedMagazine
        if (mag && p.weapon.state.magazineSeated) {
          // Grab the base, separated from the slide and the holding hand.
          const bounds = new THREE.Box3().setFromObject(mag)
          const point = bounds.clampPoint(handPosition, new THREE.Vector3())
          if (!this.pulls.some((pull) => pull.pistol === p))
            candidate(point, 0.065, () => {
              const pose = p.weapon.worldMagazineDropView()
              if (!pose) return
              this.pulls.push({
                pistol: p,
                hand: h,
                start: p.weapon.model.worldToLocal(handPosition.clone()),
                axis: pose.direction
                  .clone()
                  .transformDirection(
                    new THREE.Matrix4().copy(p.weapon.model.matrixWorld).invert(),
                  ),
              })
            })
        }
        const gripSocket = p.weapon.model.getObjectByName('GripSocket')
        if (gripSocket)
          candidate(position(gripSocket), 0.07, () => {
            p.holder = h
            this.supports.delete(p)
          })
        const muzzle = p.weapon.worldMuzzle?.()
        if (muzzle && !this.supports.has(p))
          candidate(muzzle, 0.12, () => {
            this.supports.set(p, h)
          })

        const slide = p.weapon.trackedSlide
        if (slide && !this.slideHeld(p)) {
          const point = new THREE.Box3()
            .setFromObject(slide.object)
            .clampPoint(handPosition, new THREE.Vector3())
          candidate(point, 0.055, () => {
            this.slides.push({
              pistol: p,
              hand: h,
              start: slide.object.parent!.worldToLocal(handPosition.clone()),
              travel: p.weapon.state.slide,
            })
            p.weapon.release()
            slideSound(p.weapon)
          })
        }
      }
      candidates.sort((a, b) => a.distance - b.distance)[0]?.grab()
    }
    for (const s of this.slides) {
      const slide = s.pistol.weapon.trackedSlide!
      const travel =
        slide.object.parent!.worldToLocal(position(s.hand.grip)).sub(s.start).dot(slide.axis) /
        slide.travel
      emit(s.pistol, s.pistol.weapon.moveSlide(s.travel + travel, now))
    }
    // Infinite chest supplies must not accumulate an unbounded pile of dropped models.
    const dropped = this.magazines.filter((m) => !m.holder && !m.pocket)
    for (const m of dropped.slice(0, Math.max(0, dropped.length - 16))) {
      m.root.removeFromParent()
      this.magazines.splice(this.magazines.indexOf(m), 1)
    }
    for (const m of this.magazines)
      if (!m.holder && !m.pocket) {
        if (this.droppedPhysics?.(m.root, m.velocity, m.angularVelocity)) continue
        const step = Math.min(dt, 0.05)
        m.velocity.y -= 9.81 * step
        const distance = Math.max(0, -m.velocity.y * step) + 0.035
        const probe = m.root.position.clone()
        probe.x += m.velocity.x * step
        probe.z += m.velocity.z * step
        const hit = m.velocity.y <= 0 ? ground(probe, distance) : null
        m.root.position.addScaledVector(m.velocity, step)
        const spin = m.angularVelocity.length()
        if (spin > 1e-8)
          m.root.quaternion
            .premultiply(
              new THREE.Quaternion().setFromAxisAngle(
                m.angularVelocity.clone().divideScalar(spin),
                spin * step,
              ),
            )
            .normalize()
        if (hit) {
          m.root.position.y = hit.y + 0.025
          m.velocity.set(0, 0, 0)
          m.angularVelocity.set(0, 0, 0)
        }
      }
    for (const p of this.pistols) {
      if (p.holder) {
        if (!p.grab.hands.length) {
          p.holdMount.position.copy(p.holder.mount.getWorldPosition(new THREE.Vector3()))
          this.loose.worldToLocal(p.holdMount.position)
          p.holdMount.quaternion
            .copy(p.holder.mount.getWorldQuaternion(new THREE.Quaternion()))
            .premultiply(this.loose.getWorldQuaternion(new THREE.Quaternion()).invert())
            .normalize()
        }
        const support = this.supports.get(p)
        p.grab.update(p.holdMount, [p.holder.grip, ...(support ? [support.grip] : [])], dt)
      } else p.grab.reset()
      p.weapon.trackedSupport = this.supported(p)
      p.weapon.syncTracked(this.mount(p), now, height)
    }
    this.touchLasers(hands)
    this.held = new Set(hands.filter(squeezed).map((h) => h.source!))
    return events
  }
}
