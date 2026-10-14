import * as THREE from 'three'
import type { GrabHand as FullGrabHand } from './xr-grab.js'
type GrabHand = Pick<FullGrabHand, 'grip' | 'source'>
import type { XRCalibration } from './xr-calibration.js'

export interface MotorcycleGrab {
  frame: THREE.Object3D
  bar: THREE.Object3D
  axis: THREE.Vector3
  pivot: THREE.Vector3
  left: THREE.Vector3
  right: THREE.Vector3
  steerLimit: number
}
type Held = { hand: GrabHand; start: THREE.Vector3; steer: number; rotation: THREE.Quaternion }
const clamp = THREE.MathUtils.clamp
const squeeze = (h: GrabHand) =>
  !!h.source?.gamepad?.buttons[1]?.pressed || (h.source?.gamepad?.buttons[1]?.value ?? 0) > 0.6

/** Physical handlebar steering and a right wrist throttle; all motion is chassis-relative. */
export class XRMotorcycle {
  private holders = new Map<string, Held>()
  private bar: THREE.Object3D | null = null
  private anchors = { left: new THREE.Object3D(), right: new THREE.Object3D() }
  constructor(
    private readonly calibration: Pick<XRCalibration, 'get' | 'apply' | 'motorcycleStatus'>,
  ) {}
  reset(): void {
    this.holders.clear()
    this.bar = null
  }
  owns(source: XRInputSource | null): boolean {
    return !!source && [...this.holders.values()].some((h) => h.hand.source === source)
  }
  update(hands: readonly GrabHand[], rig: MotorcycleGrab | null, steer: number, enabled: boolean) {
    const output = { throttle: 0, steering: 0, frontBrake: 0, rearBrake: 0 }
    if (!enabled || !rig) {
      this.reset()
      this.calibration.motorcycleStatus = 'Sin manillar agarrado'
      return output
    }
    if (this.bar !== rig.bar) {
      this.reset()
      this.bar = rig.bar
    }
    rig.frame.updateWorldMatrix(true, true)
    const cfg = this.calibration.get('bike-controls')
    const frameRotation = rig.frame.getWorldQuaternion(new THREE.Quaternion()).invert()
    const rotation = (h: GrabHand) =>
      frameRotation.clone().multiply(h.grip.getWorldQuaternion(new THREE.Quaternion()))
    const point = (h: GrabHand) =>
      rig.frame.worldToLocal(h.grip.getWorldPosition(new THREE.Vector3()))
    const steering: number[] = []
    for (const side of ['left', 'right'] as const) {
      const hand = hands.find((h) => h.source?.handedness === side)
      let held = this.holders.get(side)
      if (!hand || !squeeze(hand) || (held && held.hand !== hand)) {
        this.holders.delete(side)
        held = undefined
      }
      const anchor = this.anchors[side]
      // Calibration is independent of the tracked hand mesh and held weapons.
      this.calibration.apply(anchor, side === 'left' ? 'bike-left' : 'bike-right')
      const socket = rig[side].clone().add(anchor.position)
      rig.bar.localToWorld(socket)
      const target = rig.frame.worldToLocal(socket)
      if (!held && hand && squeeze(hand) && point(hand).distanceTo(target) <= 0.16) {
        held = {
          hand,
          start: point(hand).sub(rig.pivot),
          steer: clamp(-steer / rig.steerLimit, -1, 1),
          rotation: rotation(hand),
        }
        this.holders.set(side, held)
        void hand.source?.gamepad?.hapticActuators?.[0]?.pulse(0.25, 35)
      }
      if (!held) continue
      const next = point(held.hand).sub(rig.pivot)
      const a = held.start.clone().addScaledVector(rig.axis, -held.start.dot(rig.axis)).normalize()
      const b = next.addScaledVector(rig.axis, -next.dot(rig.axis)).normalize()
      const angle = Math.atan2(rig.axis.dot(a.clone().cross(b)), a.dot(b))
      steering.push(clamp(held.steer - angle / THREE.MathUtils.degToRad(cfg.z), -1, 1))
      const raw = held.hand.source?.gamepad?.buttons[0]?.value ?? 0
      const trigger = Number.isFinite(raw) ? clamp(raw, 0, 1) : 0
      if (side === 'left') output.rearBrake = clamp((trigger * cfg.ry) / 100, 0, 1)
      else {
        output.frontBrake = clamp((trigger * cfg.rx) / 100, 0, 1)
        const delta = rotation(held.hand).multiply(held.rotation.clone().invert())
        // Twist about the handlebar's lateral axle, independent of controller yaw/roll.
        const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(anchor.quaternion)
        const projection = new THREE.Vector3(delta.x, delta.y, delta.z).dot(axis)
        let twist = 2 * Math.atan2(projection, delta.w)
        twist = Math.atan2(Math.sin(twist), Math.cos(twist))
        const degrees = THREE.MathUtils.radToDeg(twist) * cfg.rz
        output.throttle = clamp((degrees - cfg.y) / Math.max(1, cfg.x - cfg.y), 0, 1)
      }
    }
    if (steering.length) output.steering = steering.reduce((a, b) => a + b, 0) / steering.length
    this.calibration.motorcycleStatus = `Agarre ${this.holders.has('left') ? 'I' : '—'}/${this.holders.has('right') ? 'D' : '—'} · Gas ${Math.round(output.throttle * 100)}% · Del. ${Math.round(output.frontBrake * 100)}% · Tras. ${Math.round(output.rearBrake * 100)}%`
    return output
  }
}
