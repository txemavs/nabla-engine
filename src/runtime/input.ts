import { controlDefaults } from '../config/controls.js'
import { KeyboardSteering } from '../simulation/vehicles/keyboard-steering.js'
import { idleInput, type PlayerInput, type Simulation } from '../simulation/simulation.js'
import type { SceneDocument } from '../scene/document.js'
import { isRoadTouchDriving } from './touch-driving.js'
/** Gamepad access may be absent or denied on HTTP LAN origins and embedded views. */
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
    const id = sim?.player.vehicleId
    const flight = Boolean(id && sim?.vehicleInfo(id).flightMode)
    const axis = (positive: string, negative: string) =>
      Number(keys.has(positive)) - Number(keys.has(negative))
    const analog = pad
      ? gamepadAxes(pad, flight)
      : { forward: 0, right: 0, lift: 0, turn: 0, brake: false }
    const touch = sources.touch ?? { forward: 0, right: 0, lift: 0, turn: 0, brake: false }
    const driving = sources.driving ?? { forward: 0, right: 0, brake: false }
    const keyboardRight = flight
      ? axis('ArrowRight', 'ArrowLeft')
      : axis('KeyD', 'KeyA') + axis('ArrowRight', 'ArrowLeft')
    const vehicle = id ? document.entities.find((e) => e.id === id)?.vehicle : null
    const roadCar = id && isRoadTouchDriving(vehicle, flight)
    const input: PlayerInput = {
      forward:
        (flight
          ? axis('ArrowUp', 'ArrowDown')
          : axis('KeyW', 'KeyS') + axis('ArrowUp', 'ArrowDown')) +
        analog.forward +
        touch.forward +
        driving.forward,
      right:
        this.steering.update(roadCar ? id : null, keyboardRight, elapsed) +
        analog.right +
        touch.right +
        driving.right,
      lift: (flight ? axis('KeyW', 'KeyS') : 0) + analog.lift + touch.lift,
      turn: (flight ? axis('KeyD', 'KeyA') : 0) + analog.turn + touch.turn,
      yaw,
      sprint:
        keys.has('ShiftLeft') ||
        keys.has('ShiftRight') ||
        Boolean(pad?.buttons[10]?.pressed) ||
        !!driving.sprint,
      jump: false,
      brake: keys.has('Space') || analog.brake || touch.brake || driving.brake,
    }
    return finiteInput(input)
  }
}
