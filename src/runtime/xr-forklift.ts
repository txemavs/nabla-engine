import { Object3D, Vector3 } from 'three'
import type { GrabHand } from './xr-grab.js'
import type { ForkliftInput } from '../simulation/forklift.js'
/** Three spring-return hydraulic levers, held with grip and pulled/pushed in chassis space. */
export class XRForklift {
  private held = new Map<number, { hand: GrabHand; start: number }>()
  private object: Object3D | null = null
  owns(source: XRInputSource | null): boolean {
    return !!source && [...this.held.values()].some((v) => v.hand.source === source)
  }
  update(hands: readonly GrabHand[], object: Object3D | null): ForkliftInput {
    if (object !== this.object) {
      this.held.clear()
      this.object = object
    }
    const output: ForkliftInput = [0, 0, 0]
    if (!object) return output
    object.updateWorldMatrix(true, true)
    const position = (h: GrabHand) => object.worldToLocal(h.grip.getWorldPosition(new Vector3()))
    const squeeze = (h: GrabHand) =>
      !!h.source?.gamepad?.buttons[1]?.pressed || (h.source?.gamepad?.buttons[1]?.value ?? 0) > 0.6
    for (let i = 0; i < 3; i++) {
      const lever = object.getObjectByName('forklift-lever-' + i)
      if (!lever) continue
      let held = this.held.get(i)
      if (held && (!hands.includes(held.hand) || !squeeze(held.hand))) {
        this.held.delete(i)
        held = undefined
      }
      if (!held) {
        const knob = lever.localToWorld(
          new Vector3().fromArray(lever.userData.grabPoint ?? [0, 0.19, 0]),
        )
        const hand = hands.find(
          (h) =>
            squeeze(h) &&
            !this.owns(h.source) &&
            h.grip.getWorldPosition(new Vector3()).distanceTo(knob) < 0.065,
        )
        if (hand) {
          held = { hand, start: position(hand).z }
          this.held.set(i, held)
        }
      }
      if (held) {
        const delta = position(held.hand).z - held.start
        output[i] = Math.abs(delta) < 0.012 ? 0 : Math.max(-1, Math.min(1, delta / 0.08))
      }
      lever.rotation.x = output[i] * 0.4
    }
    return output
  }
}
