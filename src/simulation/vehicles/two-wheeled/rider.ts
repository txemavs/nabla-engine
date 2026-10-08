/**
 * Pure rider counterweight math. The rider is part of the vehicle mass; moving the rider by
 * `shift` (chassis-local metres) moves the whole vehicle's centre of mass by
 * `shift · riderMass / totalMass`. Lateral shift is +X (right), fore-aft is +Z (backwards),
 * the chassis axes.
 */
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

export interface RiderLimits {
  /** Rider mass included in the vehicle mass, kg. */
  mass: number
  /** Largest sideways shift, metres. */
  lateral: number
  /** Largest forward shift, metres. */
  forward: number
  /** Largest rearward shift, metres. */
  back: number
  /** Full travel per second. */
  rate: number
}

/**
 * Target rider offset for inputs `right` (−1 left … +1 right) and `forward` (−1 back … +1 over
 * the tank): chassis-local [x, z] metres (z positive backwards).
 */
export function riderTarget(
  right: number,
  forward: number,
  limits: RiderLimits,
  /** Largest sideways input; above 1 only for the automatic rider's full-lean hang-off. */
  reach = 1,
): [number, number] {
  const r = clamp(Number.isFinite(right) ? right : 0, -reach, reach)
  const f = clamp(Number.isFinite(forward) ? forward : 0, -1, 1)
  return [r * limits.lateral, f >= 0 ? -f * limits.forward : -f * limits.back]
}

/** Move the rider towards `target` at `rate` full travels per second; returns the new offset. */
export function stepRider(
  current: readonly [number, number],
  target: readonly [number, number],
  limits: RiderLimits,
  dt: number,
): [number, number] {
  const step = (value: number, goal: number, travel: number) =>
    value + clamp(goal - value, -travel * limits.rate * dt, travel * limits.rate * dt)
  return [
    step(current[0], target[0], limits.lateral),
    step(current[1], target[1], Math.max(limits.forward, limits.back)),
  ]
}

/**
 * Chassis centre-of-mass offset (chassis-local metres) for a rider whose seated centre of mass
 * is `seat` and who moved by `shift` ([x, z]); the remaining mass stays at the chassis origin.
 */
export function riderCentreOfMass(
  seat: readonly [number, number, number],
  shift: readonly [number, number],
  riderMass: number,
  totalMass: number,
): [number, number, number] {
  if (!(totalMass > 0) || !(riderMass >= 0) || riderMass >= totalMass)
    throw new Error('Rider mass must be below the total mass')
  const share = riderMass / totalMass
  return [(seat[0] + shift[0]) * share, seat[1] * share, (seat[2] + shift[1]) * share]
}

/**
 * Lean offset of the bike for a sideways centre-of-mass offset `lateral` (metres, +right) at
 * height `comHeight`, to add to the lean of the whole machine plus rider: atan(lateral / h),
 * left-positive. Hanging off to the inside of a turn therefore leans the bike less, and a rider
 * shifted right on a straight road has the bike leaning slightly left.
 */
export function hangOffLean(lateral: number, comHeight: number): number {
  if (!(comHeight > 0)) return 0
  return Math.atan2(lateral, comHeight)
}

/** Automatic rider body movement when the counterweight keys are not pressed. */
export interface AutoRiderSettings {
  /** Off: the rider sits centred unless the keys move them (phase-2 behaviour). */
  enabled: boolean
  /** Sideways input (0..1 of the full shift) at the largest lean, past `leanDeadband`. */
  hangOff: number
  /** Extra sideways input at the full (peg) lean, growing with the lean past `maxLean`. */
  pegHangOff: number
  /** Sideways input per unit of steering demand (towards the turn). */
  steer: number
  /** Lean below which the rider stays centred, radians. */
  leanDeadband: number
  /** Forward input per g of acceleration past `accelDeadband`, with the throttle open. */
  accelGain: number
  /** Rearward input per g of deceleration past `accelDeadband`, with the front lever pulled. */
  brakeGain: number
  /** Acceleration below which the rider stays centred, g. */
  accelDeadband: number
  /** Seconds for the keys to take over from the automatic rider. */
  takeover: number
  /** Seconds after the keys are released before the automatic rider takes back over. */
  releaseDelay: number
  /** Seconds to blend from the keys back to the automatic rider. */
  blend: number
}

export interface AutoRiderInput {
  /** Measured lean, left-positive, radians. */
  lean: number
  maxLean: number
  /** Peg (full) lean on the side of the current lean; omitted = no full lean. */
  pegLean?: number
  /** Bar demand, +1 full right. */
  steering: number
  /** Filtered longitudinal acceleration along the chassis forward axis, m/s². */
  acceleration: number
  gravity: number
  /** Throttle 0..1 and front lever 0..1. */
  throttle: number
  lever: number
}

/**
 * Normalised automatic rider input `[right, forward]` (the same scale as the keys): hang off to
 * the inside of a turn in proportion to lean and steering, move forward under hard acceleration
 * (keeps the front down) and back under hard front braking (limits the stoppie), centred while
 * cruising.
 */
export function autoRiderInput(input: AutoRiderInput, auto: AutoRiderSettings): [number, number] {
  if (!auto.enabled) return [0, 0]
  const span = Math.max(1e-6, input.maxLean - auto.leanDeadband)
  const leanShare = clamp((Math.abs(input.lean) - auto.leanDeadband) / span, 0, 1)
  // Lean is left-positive; hanging off to the left is a negative `right`.
  // Past `maxLean` towards the peg lean the rider hangs off further (up to `pegHangOff` more).
  const pegSpan = (input.pegLean ?? 0) - input.maxLean
  const pegShare =
    pegSpan > 1e-6 ? clamp((Math.abs(input.lean) - input.maxLean) / pegSpan, 0, 1) : 0
  const right =
    clamp(-Math.sign(input.lean) * leanShare * auto.hangOff + input.steering * auto.steer, -1, 1) -
    Math.sign(input.lean) * pegShare * auto.pegHangOff
  const g = input.acceleration / Math.max(1e-6, input.gravity)
  const forward =
    input.throttle > 0.3 && g > auto.accelDeadband
      ? clamp((g - auto.accelDeadband) * auto.accelGain, 0, 1)
      : input.lever > 0.1 && -g > auto.accelDeadband
        ? -clamp((-g - auto.accelDeadband) * auto.brakeGain, 0, 1)
        : 0
  return [right, forward]
}

/** Share of the key input (1) against the automatic rider (0), and the release countdown. */
export interface RiderControlState {
  manualShare: number
  manualHold: number
}

/**
 * Advance the hand-over between keys and automatic rider: a key press takes over within
 * `takeover` seconds; after `releaseDelay` seconds without keys the automatic rider blends back
 * in over `blend` seconds.
 */
export function stepRiderControl(
  state: RiderControlState,
  manual: boolean,
  auto: AutoRiderSettings,
  dt: number,
): RiderControlState {
  if (!auto.enabled) return { manualShare: 1, manualHold: 0 }
  if (manual)
    return {
      manualShare: clamp(state.manualShare + dt / Math.max(1e-6, auto.takeover), 0, 1),
      manualHold: auto.releaseDelay,
    }
  const hold = Math.max(0, state.manualHold - dt)
  return {
    manualShare:
      hold > 0
        ? state.manualShare
        : clamp(state.manualShare - dt / Math.max(1e-6, auto.blend), 0, 1),
    manualHold: hold,
  }
}

/** Tuck behind the windscreen at speed. */
export interface RiderTuckSettings {
  enabled: boolean
  /** The head starts to go down from this speed, km/h (automatic tuck and forward-key reach). */
  kmh: number
  /** Full tuck from this speed, km/h; eased ramp from `kmh`. */
  fullKmh: number
  /**
   * The automatic tuck is fully released below this speed, km/h (hysteresis): on the way down
   * the ramp runs `kmh - releaseKmh` lower than on the way up.
   */
  releaseKmh: number
  /** Seconds for a full tuck. */
  seconds: number
  /** Deceleration that sits the rider up, g. */
  brakeG: number
  /** Tucked cockpit eye relative to the seated one, chassis metres (+y up, +z back). */
  eye: readonly [number, number, number]
}

/** Eased 0..1 ramp from `from` to `to` km/h (smoothstep; a step when the span is empty). */
function speedRamp(speedKmh: number, from: number, to: number): number {
  if (to <= from) return speedKmh >= from ? 1 : 0
  const t = clamp((speedKmh - from) / (to - from), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Automatic tuck depth 0..1 with hysteresis. Speeding up, the head goes down along an eased ramp
 * from `kmh` (0) to `fullKmh` (1); slowing down, it comes back up along the same ramp shifted
 * `kmh - releaseKmh` lower (so 1 until `fullKmh - (kmh - releaseKmh)`, 0 at `releaseKmh`). In
 * between, `previous` (the last depth) holds. Hard braking (deceleration beyond `brakeG`) sits
 * the rider up at any speed.
 */
export function autoTuckDepth(
  previous: number,
  speedKmh: number,
  decelerationG: number,
  tuck: RiderTuckSettings,
): number {
  if (!tuck.enabled || decelerationG > tuck.brakeG) return 0
  const gap = Math.max(0, tuck.kmh - tuck.releaseKmh)
  const up = speedRamp(speedKmh, tuck.kmh, tuck.fullKmh)
  const down = speedRamp(speedKmh, tuck.kmh - gap, tuck.fullKmh - gap)
  return clamp(previous, up, down)
}

/**
 * How far the forward key reaches into the tuck at `speedKmh`: the same eased ramp as the
 * automatic tuck, 0 up to `kmh`, 1 from `fullKmh` (no jump).
 */
export function manualTuckReach(speedKmh: number, tuck: RiderTuckSettings): number {
  if (!tuck.enabled) return 0
  return speedRamp(speedKmh, tuck.kmh, tuck.fullKmh)
}

/**
 * Tuck target 0..1: the automatic depth weighted by the automatic share, plus the forward key
 * (0..1) times its reach weighted by the key share.
 */
export function tuckTarget(
  autoDepth: number,
  forwardKey: number,
  speedKmh: number,
  manualShare: number,
  tuck: RiderTuckSettings,
): number {
  const manual = Math.max(0, forwardKey) * manualTuckReach(speedKmh, tuck)
  return clamp(autoDepth * (1 - manualShare) + manual * manualShare, 0, 1)
}
