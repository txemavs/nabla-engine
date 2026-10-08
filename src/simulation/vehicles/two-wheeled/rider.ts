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
export function riderTarget(right: number, forward: number, limits: RiderLimits): [number, number] {
  const r = clamp(Number.isFinite(right) ? right : 0, -1, 1)
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
