import * as THREE from 'three'
import { XRObjectGrab } from './xr-object-grab.js'
import { XRBodyAnchor } from './xr-body-anchor.js'
import { XRUiClick } from './xr-ui-click.js'
import type { GrabHand as FullGrabHand } from './xr-grab.js'
export type StationHand = Pick<FullGrabHand, 'grip' | 'source'> & {
  visual?: { indexTip: THREE.Object3D }
}
const squeeze = (hand: StationHand) =>
  !!hand.source?.gamepad?.buttons[1]?.pressed ||
  (hand.source?.gamepad?.buttons[1]?.value ?? 0) > 0.6

/** Shared placement for driving stations and equipment: lower grip, one/two hands,
 * stable torso follow, and black touch/trigger button to pin/unpin the world pose.
 * This owns interaction only; the host owns meshes, calibration and physics.
 */
export class XRStationPlacement {
  readonly grab = new XRObjectGrab()
  readonly buttonHands = new Set<THREE.Group>()
  fixed = false
  private readonly anchor = new XRBodyAnchor()
  private readonly click = new XRUiClick()
  private down = new Set<THREE.Group>()
  private readonly buttonZ: number
  constructor(
    private readonly body: THREE.Group,
    private readonly button: THREE.Mesh,
    private readonly base: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
  ) {
    this.buttonZ = button.position.z
  }
  resetAnchor(): void {
    this.anchor.reset()
  }
  follow(camera: THREE.Camera, dt: number): void {
    if (!this.fixed && !this.grab.hands.length) this.anchor.update(this.body, camera, dt)
  }
  owns(grip: THREE.Group): boolean {
    return this.grab.hands.includes(grip) || this.buttonHands.has(grip)
  }
  update(
    hands: readonly StationHand[],
    dt = 0,
    canGrab: (hand: StationHand) => boolean = () => true,
  ): void {
    this.buttonHands.clear()
    const grips = this.grab.hands.filter((grip) =>
      hands.some((hand) => hand.grip === grip && squeeze(hand)),
    )
    this.grab.update(this.body, grips, dt)
    const down = new Set<THREE.Group>()
    for (const hand of hands) {
      const gripPosition = hand.grip.getWorldPosition(new THREE.Vector3())
      const buttonPosition = this.button.getWorldPosition(new THREE.Vector3())
      const near = gripPosition.distanceTo(buttonPosition) < 0.075
      if (
        near &&
        squeeze(hand) &&
        grips.length < 2 &&
        !grips.includes(hand.grip) &&
        canGrab(hand)
      ) {
        grips.push(hand.grip)
        this.grab.update(this.body, grips, 0)
      }
      const finger = hand.visual?.indexTip.getWorldPosition(new THREE.Vector3())
      const touch = !squeeze(hand) && !!finger && finger.distanceTo(buttonPosition) < 0.03
      const trigger = hand.source?.gamepad?.buttons[0]
      if (touch || (near && (!!trigger?.pressed || (trigger?.value ?? 0) > 0.8))) {
        down.add(hand.grip)
        this.buttonHands.add(hand.grip)
        if (!this.down.has(hand.grip)) {
          this.fixed = !this.fixed
          this.click.play()
          void hand.source?.gamepad?.hapticActuators?.[0]?.pulse(0.25, 40).catch(() => {})
        }
      }
    }
    this.down = down
    this.button.position.z = down.size ? this.buttonZ - 0.006 : this.buttonZ
    this.base.material.color.set(this.fixed ? '#4e9aaf' : '#555e66')
  }
  reset(): void {
    this.grab.reset()
    this.down.clear()
    this.buttonHands.clear()
  }
  dispose(): void {
    this.reset()
    this.click.dispose()
  }
}
