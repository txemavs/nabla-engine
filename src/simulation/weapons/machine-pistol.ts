/**
 * Experimental full-auto ("RÁFAGA 30") for the sidearm, kept apart from the semi-automatic
 * firearm model (`firearm.ts`). M on foot with the pistol drawn toggles SEMI / RÁFAGA 30.
 *
 * In RÁFAGA the trigger held fires again every `60000 / rpm` ms, the magazine holds 30
 * cartridges, each shot adds the preset muzzle rise (it accumulates; the shooter pulls it down)
 * and a random sideways kick that recovers once the trigger is released.
 *
 * TODO(unverified): 900 rpm, the 30-round magazine and the yaw kick are presentation values for
 * an experimental mode, not data for a real machine pistol.
 */
import { trigger, type FirearmEvent, type FirearmSpec, type FirearmState } from './firearm.js'

export type FireMode = 'semi' | 'burst30'

export const machinePistol = Object.freeze({
  /** Cartridges in the RÁFAGA magazine. */
  magazineCapacity: 30,
  /** Cyclic rate, rounds per minute. TODO(unverified). */
  rpm: 900,
  /** Largest random sideways kick per shot, degrees. TODO(unverified). */
  yawKickDeg: 0.35,
  /** Time constant of the sideways recovery after the trigger is released, seconds. */
  yawRecoverySeconds: 0.25,
})

/** HUD label of a fire mode. */
export function fireModeLabel(mode: FireMode): string {
  return mode === 'burst30' ? 'EXPERIMENTAL · RÁFAGA 30' : 'SEMI'
}

export function nextFireMode(mode: FireMode): FireMode {
  return mode === 'semi' ? 'burst30' : 'semi'
}

/** Milliseconds between automatic shots. */
export function autoIntervalMs(rpm: number = machinePistol.rpm): number {
  return 60000 / Math.max(1, rpm)
}

/** The firearm spec for a mode: RÁFAGA has the 30-round magazine and a cycle no slower than its rate. */
export function specForMode(base: FirearmSpec, mode: FireMode): FirearmSpec {
  if (mode === 'semi') return base
  return {
    ...base,
    magazineCapacity: machinePistol.magazineCapacity,
    cycleMs: Math.min(base.cycleMs, autoIntervalMs()),
  }
}

/**
 * One trigger sample in either mode. In RÁFAGA a held trigger counts as a fresh press once the
 * automatic interval has passed since the last shot, so it keeps firing until released or empty.
 */
export function pullTrigger(
  state: FirearmState,
  spec: FirearmSpec,
  mode: FireMode,
  pressed: boolean,
  now: number,
): FirearmEvent {
  if (
    mode === 'burst30' &&
    pressed &&
    state.triggerHeld &&
    now - state.lastShotMs >= autoIntervalMs()
  )
    state.triggerHeld = false
  return trigger(state, spec, pressed, now)
}

/**
 * Sideways recoil: each shot adds a random kick; with the trigger released the offset decays back
 * to zero. `step` returns the yaw change (rad) since the previous call, to add to the aim.
 */
export class RecoilYaw {
  private offset = 0
  private applied = 0

  constructor(private readonly random: () => number = Math.random) {}

  kick(): void {
    const max = (machinePistol.yawKickDeg * Math.PI) / 180
    this.offset += (this.random() * 2 - 1) * max
  }

  step(dt: number, held: boolean): number {
    if (!held && dt > 0) this.offset *= Math.exp(-dt / machinePistol.yawRecoverySeconds)
    const delta = this.offset - this.applied
    this.applied = this.offset
    return delta
  }

  get total(): number {
    return this.offset
  }

  reset(): void {
    this.offset = 0
    this.applied = 0
  }
}
