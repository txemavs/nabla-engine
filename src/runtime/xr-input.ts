import { xrActionButtons, type InputAction } from '../config/input-bindings.js'
import { deadzone } from './input.js'

/** XR standard mapping: trigger, squeeze, touchpad, stick, primary, secondary. */
export class XRGameInput {
  private held = new Set<string>()
  private turnHeld = false

  reset(): void {
    this.held.clear()
    this.turnHeld = false
  }

  /** Resolve by handedness, never controller enumeration order. Actions fire on rising edges. */
  read(
    sources: Iterable<XRInputSource>,
    flight: boolean,
    seated: boolean,
    enabled: boolean,
    _weapon = false,
  ) {
    const hands = new Map<XRHandedness, Gamepad>()
    if (enabled)
      for (const source of sources)
        if (source.targetRayMode === 'tracked-pointer' && !source.hand && source.gamepad)
          hands.set(source.handedness, source.gamepad)
    const axis = (hand: XRHandedness, index: number) => deadzone(hands.get(hand)?.axes[index] ?? 0)
    const button = (hand: XRHandedness, index: number) =>
      hands.get(hand)?.buttons[index]?.pressed ?? false
    const value = (hand: XRHandedness, index: number) => {
      const n = hands.get(hand)?.buttons[index]?.value ?? 0
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
    }
    const next = new Set<string>()
    const actions: InputAction[] = []
    for (const [hand, index, action] of xrActionButtons) {
      const key = `${hand}:${index}`
      if (button(hand, index)) {
        next.add(key)
        if (!this.held.has(key)) actions.push(action)
      }
    }
    this.held = next
    const turn = axis('right', 2)
    const snap =
      !flight && !seated && Math.abs(turn) > 0.7 && !this.turnHeld
        ? (-Math.sign(turn) * Math.PI) / 6
        : 0
    if (Math.abs(turn) < 0.25) this.turnHeld = false
    else if (Math.abs(turn) > 0.7) this.turnHeld = true
    return {
      actions,
      snap,
      touch: {
        forward: flight
          ? -axis('right', 3) || 0
          : seated
            ? value('right', 0) - value('left', 0)
            : -axis('left', 3) || 0,
        right: flight ? axis('right', 2) : axis('left', 2),
        lift: flight ? -axis('left', 3) || 0 : 0,
        turn: flight ? axis('left', 2) : 0,
        brake: seated && button('right', 5),
      },
    }
  }
}
