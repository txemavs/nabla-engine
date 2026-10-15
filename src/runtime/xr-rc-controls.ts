import { XRForklift } from './xr-forklift.js'
import type { ForkliftInput } from '../simulation/forklift.js'
import { XRStationPlacement } from './xr-station-placement.js'
import * as THREE from 'three'
import { XRMotorcycle } from './xr-motorcycle.js'
import { XRCalibration } from './xr-calibration.js'
import type { GrabHand as FullGrabHand } from './xr-grab.js'
type GrabHand = Pick<FullGrabHand, 'grip' | 'source'> & { visual?: { indexTip: THREE.Object3D } }
const squeeze = (h: GrabHand) =>
  !!h.source?.gamepad?.buttons[1]?.pressed || (h.source?.gamepad?.buttons[1]?.value ?? 0) > 0.6

/** Full-size body-following controls with independent AR station calibration. */
export class ARRCControls {
  readonly body = new THREE.Group()
  private camera?: THREE.Camera
  readonly root = new THREE.Group()
  readonly spin = new THREE.Group()
  readonly equipment = new THREE.Group()
  private readonly hydraulics = new XRForklift()
  enabled = true
  get fixed(): boolean {
    return this.placement.fixed
  }
  set fixed(value: boolean) {
    this.placement.fixed = value
  }
  readonly pinButton = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.018, 16),
    new THREE.MeshStandardMaterial({ color: '#101010', roughness: 0.7 }),
  )
  private readonly pinBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.07, 0.035),
    new THREE.MeshStandardMaterial({ color: '#555e66', roughness: 0.8 }),
  )
  private readonly placement: XRStationPlacement
  private get stationGrab() {
    return this.placement.grab
  }
  private get buttonHands() {
    return this.placement.buttonHands
  }
  private bike: XRMotorcycle
  private holders = new Map<THREE.Group, { angle: number; steer: number }>()
  private steering = 0
  kind = ''
  constructor(
    scene: THREE.Scene,
    private readonly calibration: Pick<
      XRCalibration,
      'get' | 'apply' | 'motorcycleStatus'
    > = new XRCalibration(),
  ) {
    this.bike = new XRMotorcycle(calibration)
    this.pinBase.position.set(0, -0.3, 0.02)
    this.pinButton.position.set(0, -0.3, 0.05)
    this.pinButton.rotation.x = Math.PI / 2
    this.pinButton.name = 'Fijar / llevar al pecho'
    this.placement = new XRStationPlacement(this.body, this.pinButton, this.pinBase)
    this.root.add(this.spin, this.pinBase, this.pinButton)
    this.root.visible = false
    this.body.add(this.root, this.equipment)
    scene.add(this.body)
  }
  place(camera: THREE.Camera): void {
    if (!this.camera) {
      this.root.position.set(0, -0.35, -0.45)
      this.equipment.position.set(0, -0.35, -0.45)
    }
    this.fixed = false
    this.stationGrab.reset()
    this.placement.resetAnchor()
    this.camera = camera
    this.followBody(0)
    this.reset()
  }
  private followBody(dt: number): void {
    if (!this.camera) return
    this.placement.follow(this.camera, dt)
    this.calibration.apply(
      this.root,
      this.kind === 'vfr'
        ? 'ar-rc-bike'
        : this.kind === 'truck'
          ? 'ar-rc-truck'
          : this.kind === 'forklift'
            ? 'ar-rc-forklift'
            : 'ar-rc-s3',
    )
    // Both follow/pin with the same station, but wheel calibration cannot rotate
    // the lever console. Its own zero preserves the original unrotated layout.
    this.calibration.apply(this.equipment, 'ar-rc-forklift-levers')
    this.root.updateWorldMatrix(true, true)
    this.equipment.updateWorldMatrix(true, true)
  }
  reset(): void {
    this.placement.reset()
    this.hydraulics.update([], null)
    this.holders.clear()
    this.bike.reset()
    this.steering = 0
    this.spin.rotation.set(0, 0, 0)
  }
  owns(grip: THREE.Group, source?: XRInputSource | null): boolean {
    return (
      this.enabled &&
      (this.stationGrab.hands.includes(grip) ||
        this.buttonHands.has(grip) ||
        this.holders.has(grip) ||
        this.bike.owns(source ?? null) ||
        this.hydraulics.owns(source ?? null))
    )
  }
  private updatePin(hands: readonly GrabHand[]): void {
    this.placement.update(
      hands,
      0,
      (hand) => !this.holders.has(hand.grip) && !this.bike.owns(hand.source),
    )
  }
  dispose(): void {
    this.reset()
    this.placement.dispose()
    this.pinButton.geometry.dispose()
    this.pinButton.material.dispose()
    this.pinBase.geometry.dispose()
    this.pinBase.material.dispose()
    this.body.removeFromParent()
  }
  update(hands: readonly GrabHand[], dt = 1 / 60) {
    this.followBody(dt)
    this.root.visible = this.enabled && !!this.kind
    this.equipment.visible = this.enabled && this.kind === 'forklift'
    const result = {
      throttle: 0,
      steering: 0,
      brake: 0,
      frontBrake: 0,
      rearBrake: 0,
      forklift: [0, 0, 0] as ForkliftInput,
    }
    if (!this.root.visible) {
      this.reset()
      return result
    }
    this.updatePin(hands)
    hands = hands.filter(
      (hand) => !this.stationGrab.hands.includes(hand.grip) && !this.buttonHands.has(hand.grip),
    )
    this.root.updateWorldMatrix(true, true)
    result.forklift = this.hydraulics.update(
      hands,
      this.kind === 'forklift' ? this.equipment : null,
    )
    hands = hands.filter((hand) => !this.hydraulics.owns(hand.source))
    if (this.kind === 'vfr') {
      const input = this.bike.update(
        hands,
        {
          frame: this.root,
          bar: this.spin,
          axis: new THREE.Vector3(0, 1, 0),
          pivot: new THREE.Vector3(),
          left: new THREE.Vector3(-0.275, 0.01, 0.105),
          right: new THREE.Vector3(0.275, 0.01, 0.105),
          steerLimit: 0.61,
        },
        -this.steering * 0.61,
        true,
      )
      this.steering = input.steering
      this.spin.rotation.y = -input.steering * 0.61
      return {
        forklift: result.forklift,
        throttle: input.throttle,
        steering: input.steering,
        brake: Math.max(input.frontBrake, input.rearBrake),
        frontBrake: input.frontBrake,
        rearBrake: input.rearBrake,
      }
    }
    for (const grip of this.holders.keys())
      if (!hands.some((h) => h.grip === grip && squeeze(h))) this.holders.delete(grip)
    const angles: number[] = []
    for (const hand of hands) {
      if (!hand.source || !squeeze(hand)) continue
      const p = this.root.worldToLocal(hand.grip.getWorldPosition(new THREE.Vector3()))
      const angle = Math.atan2(p.y, p.x)
      let held = this.holders.get(hand.grip)
      if (
        !held &&
        (this.spin.children.length
          ? new THREE.Box3()
              .setFromObject(this.spin)
              .distanceToPoint(hand.grip.getWorldPosition(new THREE.Vector3())) < 0.14
          : Math.abs(Math.hypot(p.x, p.y) - 0.19) < 0.13 && Math.abs(p.z) < 0.15)
      ) {
        held = { angle, steer: this.steering }
        this.holders.set(hand.grip, held)
      }
      if (!held) continue
      const delta = Math.atan2(Math.sin(angle - held.angle), Math.cos(angle - held.angle))
      angles.push(THREE.MathUtils.clamp(held.steer + delta / (Math.PI / 2), -1, 1))
      const trigger = hand.source.gamepad?.buttons[0]?.value ?? 0
      if (hand.source.handedness === 'right') result.throttle += trigger
      else result.throttle -= trigger // Engine owns braking first, then automatic reverse.
    }
    this.steering = angles.length ? angles.reduce((a, b) => a + b, 0) / angles.length : 0
    this.spin.rotation.z = (this.steering * Math.PI) / 2
    result.steering = this.steering
    return result
  }
}
