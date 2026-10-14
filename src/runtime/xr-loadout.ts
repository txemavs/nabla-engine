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
}
interface MagazineItem {
  entity: MagazineEntity
  root: THREE.Group
  holder: GrabHand | null
  pocket: THREE.Group | null
  velocity: THREE.Vector3
  previous: THREE.Vector3
}
interface SlideHold {
  pistol: CarriedPistol
  hand: GrabHand
  start: THREE.Vector3
  travel: number
}

/** Body inventory and exclusive, hold-to-grab hand ownership. Magazine entities never respawn. */
export class XRLoadout {
  readonly body = new THREE.Group()
  readonly loose = new THREE.Group()
  readonly pistols: CarriedPistol[]
  readonly pockets: THREE.Group[] = []
  readonly magazines: MagazineItem[] = []
  private slides: SlideHold[] = []
  private held = new Set<XRInputSource>()
  private origin = new THREE.Vector3()
  private stocked = false
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
      return { weapon, holster, adjustment, holder: null, triggerDown: false }
    })
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
      this.magazines.some((m) => m.holder === hand) ||
      this.slides.some((s) => s.hand === hand)
    )
  }
  slideHeld(pistol: CarriedPistol): boolean {
    return this.slides.some((s) => s.pistol === pistol)
  }
  mount(pistol: CarriedPistol): THREE.Group {
    // The holstered pose never travels into a hand: each hand has its own calibrated mount.
    return pistol.holder?.mount ?? pistol.adjustment
  }

  suspend(now: number): void {
    for (const slide of this.slides) slide.pistol.weapon.moveSlide(0, now)
    this.slides = []
    for (const pistol of this.pistols) {
      pistol.holder = null
      pistol.triggerDown = false
      pistol.weapon.release()
      pistol.weapon.visible = false
      pistol.weapon.model.visible = false
    }
    for (const item of this.magazines) {
      if (item.holder) {
        this.loose.attach(item.root)
        item.holder = null
        item.velocity.set(0, 0, 0)
      }
    }
    this.held.clear()
    this.body.visible = this.loose.visible = false
  }
  dispose(): void {
    this.suspend(performance.now())
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
    this.origin.copy(origin)
    if (!enabled) {
      this.suspend(now)
      return events
    }
    this.body.visible = this.loose.visible = true
    this.body.position.copy(position(camera))
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.getWorldQuaternion(new THREE.Quaternion()),
    )
    this.body.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0)
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
    if (!this.stocked && this.pistols[0].weapon.trackedMagazine) {
      for (let i = 0; i < 2; i++) {
        const m = this.item(this.pistols[0].weapon, createMagazine(i === 0 ? 13 : 30))!
        this.pockets[i].add(m.root)
        m.pocket = this.pockets[i]
      }
      this.stocked = true
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
      const here = position(m.root.children[0])
      if (!hands.includes(m.holder) || !squeezed(m.holder)) {
        this.loose.attach(m.root)
        m.holder = null
        const target = this.pistols.find(
          (p) =>
            !p.weapon.state.magazineSeated &&
            p.weapon.trackedMagazine &&
            position(p.weapon.trackedMagazine).distanceTo(here) < 0.11,
        )
        if (target) {
          const event = target.weapon.seatMagazine(m.entity)
          emit(target, event)
          if (event.magazineSeated) {
            m.root.removeFromParent()
            this.magazines.splice(this.magazines.indexOf(m), 1)
            continue
          }
        }
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
        }
      } else {
        if (dt > 0) m.velocity.copy(here).sub(m.previous).divideScalar(dt).clampLength(0, 8)
        m.previous.copy(here)
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
        if (!m.holder)
          candidate(position(m.root.children[0]), 0.12, () => {
            h.grip.attach(m.root)
            m.holder = h
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
          candidate(point, 0.065, () => {
            const pose = p.weapon.worldMagazineDropView()
            if (!pose) return
            const entity = p.weapon.state.magazineEntity
            if (!entity) return
            const m = this.item(p.weapon, entity)
            if (!m) return
            const event = p.weapon.takeMagazine()
            if (!event.magazineDropped) {
              m.root.removeFromParent()
              this.magazines.splice(this.magazines.indexOf(m), 1)
              return
            }
            m.root.position.copy(pose.position)
            m.root.quaternion.copy(pose.quaternion)
            h.grip.attach(m.root)
            m.holder = h
            m.previous.copy(position(m.root.children[0]))
            emit(p, { ...event, droppedMagazine: undefined })
          })
        }
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
    for (const m of this.magazines)
      if (!m.holder && !m.pocket) {
        const step = Math.min(dt, 0.05)
        m.velocity.y -= 9.81 * step
        const distance = Math.max(0, -m.velocity.y * step) + 0.035
        const hit = ground(m.root.position, distance)
        m.root.position.addScaledVector(m.velocity, step)
        if (hit) {
          m.root.position.y = hit.y + 0.025
          m.velocity.set(0, 0, 0)
        }
      }
    for (const p of this.pistols) p.weapon.syncTracked(this.mount(p), now, height)
    this.held = new Set(hands.filter(squeezed).map((h) => h.source!))
    return events
  }
}
