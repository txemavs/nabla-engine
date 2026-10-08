import { Vec3 } from '../../physics.js'
import type { CrashCause, TwoWheeledState } from './contracts.js'
import type { TwoWheeledVehicle } from './runtime.js'

/**
 * Track the impact measure and the recent speed for one tick, before any crash check. The
 * impact is the horizontal (gravity-free) velocity change per second, low-passed over
 * `crash.impactSeconds`; steady turns and hard braking stay well under `crash.impactG`.
 */
export function measureImpact(
  state: TwoWheeledState,
  velocity: Vec3,
  gravityUp: Vec3,
  dt: number,
): void {
  const crash = state.tuning.crash
  const now: [number, number, number] = [velocity.x, velocity.y, velocity.z]
  const previous = state.previousVelocity
  if (previous) {
    const change = new Vec3(now[0] - previous[0], now[1] - previous[1], now[2] - previous[2])
    const vertical = change.dot(gravityUp)
    const horizontal = change.vsub(gravityUp.scale(vertical)).length() / dt
    state.impact += (horizontal - state.impact) * Math.min(1, dt / crash.impactSeconds)
  }
  state.previousVelocity = now
  const speed = velocity.length(),
    remembered = state.recentSpeed - crash.speedMemory * dt
  if (speed >= remembered) {
    state.recentSpeed = speed
    state.recentVelocity = now
  } else state.recentSpeed = remembered
}

/** The impact or lowside crash due on this tick, if any (the loop is checked by the caller). */
export function crashTrigger(state: TwoWheeledState, gravity: number): CrashCause | null {
  const crash = state.tuning.crash
  if (state.crashed || state.recentSpeed * 3.6 < crash.minKmh) return null
  if (state.impact > crash.impactG * gravity) return 'impact'
  if (Math.abs(state.lean) > state.tuning.fallLean) return 'lowside'
  return null
}

/**
 * Start a crash: mark it, remember its speed and cause, ask the host to throw the rider off at
 * `crash.ejectKmh` or more, and kick the machine into a tumble that grows with speed:
 * a looped wheelie flips over backwards, over the front and impacts flip forwards with a roll
 * and a hop, a lowside rolls onto its side and cartwheels.
 */
export function startCrash(
  v: TwoWheeledVehicle,
  cause: CrashCause,
  forward: Vec3,
  gravityUp: Vec3,
): void {
  const state = v.twoWheeled,
    crash = state.tuning.crash
  const speed = state.recentSpeed
  state.crashed = true
  state.crashCause = cause
  state.crashSpeed = speed
  state.ejectPending = speed * 3.6 >= crash.ejectKmh
  const right = v.body.quaternion.vmult(new Vec3(1, 0, 0))
  const back = forward.scale(-1)
  const side = state.lean < 0 ? -1 : 1
  // Rotation about +right lifts the nose; about +back (chassis +Z) rolls to the left.
  const [pitch, roll] =
    cause === 'loop' ? [1, 0.25 * side] : cause === 'lowside' ? [-0.35, side] : [-1, 0.45 * side]
  const axis = right.scale(pitch).vadd(back.scale(roll))
  axis.normalize()
  const spin = Math.min(crash.maxSpin, crash.spin * speed)
  const w = v.body.angularVelocity
  v.body.angularVelocity.set(w.x + axis.x * spin, w.y + axis.y * spin, w.z + axis.z * spin)
  if (cause === 'impact' || cause === 'over-the-front') {
    const hop = gravityUp.scale(Math.min(crash.maxHop, crash.hop * speed))
    const u = v.body.velocity
    v.body.velocity.set(u.x + hop.x, u.y + hop.y, u.z + hop.z)
  }
  v.body.wakeUp()
}
