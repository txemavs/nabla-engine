import { idleUsbFrame, type UsbFrame } from './usb/controllers.js'
import {
  actionHeld,
  actionAxis,
  actionChordHeld,
  inputMode,
  type InputContext,
} from '../config/input-bindings.js'
import { controlDefaults } from '../config/controls.js'
import { KeyboardSteering } from '../simulation/vehicles/keyboard-steering.js'
import { idleInput, type PlayerInput, type Simulation } from '../simulation/simulation.js'
import type { SceneDocument } from '../scene/document.js'
import { isRoadTouchDriving } from './touch-driving.js'
/** Gamepad access may be absent or denied on HTTP LAN origins and embedded views. */
/** Share of throttle and front brake a two-wheeler gets without Shift (sprint). */
export const TWO_WHEELER_CALM_SHARE = 0.5

/** Below this speed (km/h) S on a two-wheeler is the feet paddle back, above it the rear pedal. */
export const BIKE_PADDLE_KMH = 3

export function availableGamepads(): (Gamepad | null)[] {
  if (
    typeof navigator === 'undefined' ||
    !navigator.getGamepads ||
    globalThis.isSecureContext === false
  )
    return []
  try {
    return [...navigator.getGamepads()]
  } catch {
    return []
  }
}

/** Remove the configured dead band and rescale the remaining signed range; non-finite input becomes zero. */
export function deadzone(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) <= controlDefaults.gamepadDeadzone) return 0
  return (
    Math.sign(value) *
    Math.min(
      1,
      (Math.abs(value) - controlDefaults.gamepadDeadzone) / (1 - controlDefaults.gamepadDeadzone),
    )
  )
}
/** Map standard gamepad controls; flight uses mode 2 sticks, road driving uses trigger throttle. */
export function gamepadAxes(pad: Pick<Gamepad, 'axes' | 'buttons'>, flight: boolean) {
  const axis = (i: number) => deadzone(pad.axes[i] ?? 0)
  return {
    forward: flight ? -axis(3) : (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0),
    right: flight ? axis(2) : axis(0),
    lift: flight ? -axis(1) : 0,
    turn: flight ? axis(0) : 0,
    brake: Boolean(pad.buttons[5]?.pressed),
  }
}

export interface GameInputSources {
  keys: ReadonlySet<string>
  yaw: number
  usb?: UsbFrame
  pad?: Pick<Gamepad, 'axes' | 'buttons'> | null
  touch?: { forward: number; right: number; lift: number; turn: number; brake: boolean }
  driving?: { forward: number; right: number; brake: boolean; sprint?: boolean }
  enabled?: boolean
  menuOpen?: boolean
}

/**
 * A single non-finite axis (a faulty gamepad, a touch source) would make `Simulation.setInput`
 * throw and stop the frame loop, freezing every control. Treat it as released instead.
 */
export function finiteInput(input: PlayerInput): PlayerInput {
  const safe = (value: number | undefined) => (Number.isFinite(value) ? (value as number) : 0)
  return {
    ...input,
    forward: safe(input.forward),
    right: safe(input.right),
    lift: safe(input.lift),
    turn: safe(input.turn),
    yaw: safe(input.yaw),
    riderRight: safe(input.riderRight),
    riderForward: safe(input.riderForward),
    rearBrake: Math.min(1, Math.max(0, safe(input.rearBrake))),
    serviceBrake: Math.min(1, Math.max(0, safe(input.serviceBrake))),
    clutch: Math.min(1, Math.max(0, safe(input.clutch))),
    frontBrake: Math.min(1, Math.max(0, safe(input.frontBrake))),
  }
}

/** Studio's keyboard, gamepad and touch mixing, without application focus policy. */
export class GameInput {
  private readonly steering = new KeyboardSteering()
  /** Forget keyboard steering interpolation after focus loss or a session boundary. */
  reset(): void {
    this.steering.reset()
  }

  /**
   * Combine keyboard, gamepad, touch and monitor commands into one physics input.
   * Elapsed time is seconds and yaw is radians. Disabled/menu input resets steering;
   * an open equipment menu applies the brake. The authored scene is read-only.
   */
  read(
    sim: Simulation | null,
    document: SceneDocument,
    elapsed: number,
    sources: GameInputSources,
  ): PlayerInput {
    if (sources.menuOpen || sources.enabled === false) {
      this.reset()
      return { ...idleInput(), brake: !!sources.menuOpen }
    }
    const { keys, yaw, pad } = sources
    const usb = sources.usb ?? idleUsbFrame()
    const strongest = (...values: number[]) =>
      values.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0)
    const id = sim?.player.vehicleId
    const info = id && sim ? sim.vehicleInfo(id) : null
    const flight = Boolean(info?.flightMode)
    const analog = pad
      ? gamepadAxes(pad, flight)
      : { forward: 0, right: 0, lift: 0, turn: 0, brake: false }
    const touch = sources.touch ?? { forward: 0, right: 0, lift: 0, turn: 0, brake: false }
    const driving = sources.driving ?? { forward: 0, right: 0, brake: false }
    const vehicle = id ? document.entities.find((e) => e.id === id)?.vehicle : null
    const context: InputContext = { mode: inputMode(!!id, flight, vehicle) }
    const held = (action: Parameters<typeof actionHeld>[1]) =>
      actionHeld(keys, action, context) || usb.held.has(action)
    const axis = (
      positive: Parameters<typeof actionAxis>[1],
      negative: Parameters<typeof actionAxis>[2],
    ) =>
      actionAxis(keys, positive, negative, context) +
      Number(usb.held.has(positive)) -
      Number(usb.held.has(negative))
    const keyboardRight = flight
      ? axis('flight.right', 'flight.left')
      : axis('move.right', 'move.left')
    const roadCar = id && isRoadTouchDriving(vehicle, flight)
    const shift = held('sprint')
    // Two-wheeler keys (Txema 2026-10-09): Space is the front lever, S/ArrowDown the rear pedal
    // (still a paddle back from a standstill). W and S together are full throttle, like Shift
    // (no Sticky Keys prompt), instead of cancelling out; adding Space (full front lever, as with
    // Shift) is the burnout on the spot.
    const bike = !flight && !!vehicle?.twoWheeled
    const up = held('move.forward')
    const down = held('move.back')
    const twin = (bike || !!roadCar) && actionChordHeld(keys, 'launch', context)
    const rolling = !!info && !info.reversing && info.speedKmh >= BIKE_PADDLE_KMH
    const pedal = bike && down && !up && rolling
    const keyForward = twin
      ? 1
      : flight
        ? axis('flight.forward', 'flight.back')
        : pedal
          ? Number(up)
          : axis('move.forward', 'move.back')
    const input: PlayerInput = {
      forward: strongest(
        keyForward + analog.forward + touch.forward + driving.forward,
        flight ? (usb.axes.pitch ?? 0) : (usb.axes.throttle ?? 0) - (usb.axes.reverse ?? 0),
      ),
      right: strongest(
        this.steering.update(roadCar ? id : null, keyboardRight, elapsed) +
          analog.right +
          touch.right +
          driving.right,
        flight ? (usb.axes.roll ?? 0) : (usb.axes.steering ?? 0),
      ),
      lift: strongest(
        (flight ? axis('flight.liftUp', 'flight.liftDown') : 0) + analog.lift + touch.lift,
        usb.axes.flightThrottle ?? usb.axes.lift ?? 0,
      ),
      turn: strongest(
        (flight ? axis('flight.turnRight', 'flight.turnLeft') : 0) + analog.turn + touch.turn,
        usb.axes.yaw ?? 0,
      ),
      serviceBrake: usb.axes.brake ?? 0,
      clutch: usb.axes.clutch ?? 0,
      selectedGear: usb.selectedGear,
      yaw,
      frontBrake: bike ? Math.max(held('brake') ? 1 : 0, usb.axes.brake ?? 0) : 0,
      sprint: shift || twin || Boolean(pad?.buttons[10]?.pressed) || !!driving.sprint,
      jump: false,
      brake:
        (bike ? pedal : held('brake')) ||
        analog.brake ||
        touch.brake ||
        driving.brake ||
        (usb.axes.handbrake ?? 0) > 0.5,
      // Two-wheeler rider counterweight: U/O hang off left/right, I over the tank, L sit back.
      riderRight: flight ? 0 : axis('rider.right', 'rider.left'),
      riderForward: flight ? 0 : axis('rider.forward', 'rider.back'),
    }
    // Two-wheelers (Txema 2026-10-09): without Shift the throttle and the front brake give about
    // half; Shift gives full throttle (a wheelie at launch) and full braking (the stoppie).
    if (bike && !input.sprint) {
      const usbThrottle = usb.axes.throttle !== undefined || usb.axes.reverse !== undefined
      if (!usbThrottle)
        input.forward = Math.max(-1, Math.min(1, input.forward)) * TWO_WHEELER_CALM_SHARE
      if (usb.axes.brake === undefined)
        input.frontBrake = (input.frontBrake ?? 0) * TWO_WHEELER_CALM_SHARE
    }
    return finiteInput(input)
  }
}
