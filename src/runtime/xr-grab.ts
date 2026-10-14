import * as THREE from 'three'
import type { Sidearm } from './sidearm.js'
import type { FirearmEvent } from '../simulation/weapons/firearm.js'
import { steeringWheelLock } from '../render/entity/steering-wheel.js'

export interface GrabHand {
  grip: THREE.Group
  mount: THREE.Group
  source: XRInputSource | null
}
const squeezed = (hand: GrabHand) =>
  !!hand.source?.gamepad?.buttons[1]?.pressed ||
  (hand.source?.gamepad?.buttons[1]?.value ?? 0) > 0.6
const position = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3())
const nearby = (object: THREE.Object3D, hand: GrabHand, radius: number) =>
  new THREE.Box3().setFromObject(object).distanceToPoint(position(hand.grip)) <= radius

/** Physical hold-to-grab controls. All coordinates here are render-world, never headset pitch. */
export class XRGrab {
  readonly chest = new THREE.Group()
  readonly loose = new THREE.Group()
  holder: GrabHand | null = null
  private dropped = false
  private speed = 0
  private slideHand: GrabHand | null = null
  private slideStart = new THREE.Vector3()
  private slideTravel = 0
  private held = new Set<XRInputSource>()
  private wheelHand: GrabHand | null = null
  private wheelObject: THREE.Object3D | null = null
  private wheelVector = new THREE.Vector3()
  private wheelValue = 0
  wheelStatus = 'Sin volante'
  private previousOrigin = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.chest.rotation.x = -Math.PI / 2
    scene.add(this.chest, this.loose)
  }
  reset(): void {
    this.holder = this.slideHand = this.wheelHand = null
    this.wheelObject = null
    this.dropped = false
    this.speed = 0
    this.held.clear()
  }
  dispose(): void {
    this.chest.removeFromParent()
    this.loose.removeFromParent()
  }

  wheel(
    hands: readonly GrabHand[],
    wheel: { spin: THREE.Group; axis: THREE.Vector3; pivot: THREE.Vector3 } | null,
    steer: number,
  ): number | null {
    if (
      !wheel ||
      !this.wheelHand ||
      !hands.includes(this.wheelHand) ||
      !squeezed(this.wheelHand) ||
      this.wheelObject !== wheel.spin
    ) {
      this.wheelHand = null
      this.wheelObject = wheel?.spin ?? null
    }
    if (!wheel) {
      this.wheelStatus = 'Sin volante'
      return null
    }
    const bounds = new THREE.Box3().setFromObject(wheel.spin)
    const distance = Math.min(...hands.map((h) => bounds.distanceToPoint(position(h.grip))))
    this.wheelStatus = Number.isFinite(distance)
      ? `Volante: ${Math.round(distance * 100)} cm`
      : 'Volante: sin manos'
    const frame = wheel.spin.parent!
    frame.updateWorldMatrix(true, false)
    const vector = (hand: GrabHand) => {
      const v = frame.worldToLocal(position(hand.grip)).sub(wheel.pivot)
      return v.addScaledVector(wheel.axis, -v.dot(wheel.axis)).normalize()
    }
    if (!this.wheelHand) {
      const hand = hands.find((h) => squeezed(h) && nearby(wheel.spin, h, 0.12))
      if (!hand) return null
      this.wheelHand = hand
      this.wheelVector.copy(vector(hand))
      this.wheelValue = -steer / 0.45
    } else {
      const next = vector(this.wheelHand)
      if (next.lengthSq() > 0.5 && this.wheelVector.lengthSq() > 0.5) {
        const angle = Math.atan2(
          wheel.axis.dot(this.wheelVector.clone().cross(next)),
          this.wheelVector.dot(next),
        )
        this.wheelValue = THREE.MathUtils.clamp(this.wheelValue + angle / steeringWheelLock, -1, 1)
      }
      this.wheelVector.copy(next)
    }
    this.wheelStatus = 'Volante agarrado'
    return this.wheelValue
  }

  pistol(
    weapon: Sidearm,
    hands: readonly GrabHand[],
    camera: THREE.Camera,
    origin: THREE.Vector3,
    now: number,
    dt: number,
    enabled: boolean,
    height: number,
    ground: (from: THREE.Vector3, distance: number) => THREE.Vector3 | null,
  ): FirearmEvent[] {
    const events: FirearmEvent[] = []
    const head = position(camera)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.getWorldQuaternion(new THREE.Quaternion()),
    )
    forward.y = 0
    if (forward.lengthSq() < 0.01) forward.set(0, 0, -1)
    forward.normalize()
    this.chest.position
      .copy(head)
      .addScaledVector(forward, 0.22)
      .add(new THREE.Vector3(0, -0.3, 0))
    this.chest.quaternion
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-forward.x, -forward.z))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))
    this.loose.position.add(this.previousOrigin).sub(origin)
    this.previousOrigin.copy(origin)
    if (!enabled) {
      if (this.slideHand) events.push(weapon.moveSlide(0, now))
      this.reset()
      weapon.model.visible = false
      return events
    }
    if (this.holder && (!hands.includes(this.holder) || !squeezed(this.holder))) {
      this.loose.position.copy(position(this.holder.mount))
      this.loose.quaternion.copy(this.holder.mount.getWorldQuaternion(new THREE.Quaternion()))
      this.dropped = false // The carried pistol always returns to its chest holster.
      this.speed = 0
      this.holder = null
    }
    let mount = this.holder?.mount ?? (this.dropped ? this.loose : this.chest)
    weapon.syncTracked(mount, now, height)
    const fresh = (h: GrabHand) => squeezed(h) && !!h.source && !this.held.has(h.source)
    if (!this.holder) {
      const socket = weapon.model.getObjectByName('GripSocket') ?? weapon.model
      this.holder =
        hands.find((h) => fresh(h) && position(h.grip).distanceTo(position(socket)) < 0.18) ?? null
      if (this.holder) {
        this.dropped = false
        mount = this.holder.mount
        weapon.syncTracked(mount, now, height)
      }
    }
    if (
      this.slideHand &&
      (!this.holder || !hands.includes(this.slideHand) || !squeezed(this.slideHand))
    ) {
      events.push(weapon.moveSlide(0, now))
      this.slideHand = null
    }
    const slide = weapon.trackedSlide
    if (this.holder && slide) {
      if (!this.slideHand) {
        this.slideHand =
          hands.find((h) => h !== this.holder && fresh(h) && nearby(slide.object, h, 0.09)) ?? null
        if (this.slideHand) {
          this.slideStart.copy(slide.object.parent!.worldToLocal(position(this.slideHand.grip)))
          this.slideTravel = weapon.state.slide
          weapon.release()
        }
      }
      if (this.slideHand) {
        const p = slide.object.parent!.worldToLocal(position(this.slideHand.grip))
        events.push(
          weapon.moveSlide(
            this.slideTravel + p.sub(this.slideStart).dot(slide.axis) / slide.travel,
            now,
          ),
        )
      }
    }
    if (this.dropped && !this.holder) {
      const distance = (this.speed += 9.81 * dt) * dt
      const hit = ground(this.loose.position, distance + 0.08)
      if (hit) {
        this.loose.position.copy(hit).add(new THREE.Vector3(0, 0.08, 0))
        this.speed = 0
      } else this.loose.position.y -= distance
    }
    this.held = new Set(hands.filter(squeezed).map((h) => h.source!))
    return events
  }
  get slideHeld(): boolean {
    return !!this.slideHand
  }
  get mount(): THREE.Group {
    return this.holder?.mount ?? (this.dropped ? this.loose : this.chest)
  }
}
