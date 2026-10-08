/**
 * Pure single-track pitch math: axle loads with longitudinal load transfer, wheelie and
 * stoppie thresholds, the loop-out balance point and the wheelie/stoppie assist curve.
 * No physics world. Angles are radians (nose up positive), forces newtons, lengths metres.
 *
 * The rigid-body model is the textbook planar one: with the centre of mass at height `h` above
 * the ground, `b` ahead of the rear contact and `a` behind the front contact (`a + b` = the
 * contact base `L`), a longitudinal ground force `F` (drive positive, braking negative) moves
 *   ΔN = F·h / L
 * from the front to the rear tyre. The front lifts when its load reaches zero.
 */
type Vec3Like = readonly [number, number, number]

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

export interface PitchGeometry {
  /** Total mass, kg. */
  mass: number
  /** Gravity, m/s². */
  gravity: number
  /** Centre-of-mass height above the ground, metres. */
  comHeight: number
  /** Horizontal distance from the rear contact forward to the centre of mass, metres. */
  comToRear: number
  /** Horizontal distance from the centre of mass forward to the front contact, metres. */
  comToFront: number
}

function checked(g: PitchGeometry): PitchGeometry {
  if (
    !(g.mass > 0) ||
    !(g.gravity > 0) ||
    !(g.comHeight > 0) ||
    !(g.comToRear > 0) ||
    !(g.comToFront > 0)
  )
    throw new Error('Pitch geometry needs positive mass, gravity, CoM height and contact distances')
  return g
}

/**
 * Normal loads on the front and rear tyre for a longitudinal ground force `force` (N, drive
 * positive, braking negative), steady state on level ground. A negative load means that wheel
 * has lifted (the other one then carries everything and the chassis pitches).
 */
export function axleLoads(g: PitchGeometry, force: number): { front: number; rear: number } {
  const { mass, gravity, comHeight, comToRear, comToFront } = checked(g)
  const base = comToRear + comToFront
  const weight = mass * gravity
  const transfer = (force * comHeight) / base
  return {
    front: (weight * comToRear) / base - transfer,
    rear: (weight * comToFront) / base + transfer,
  }
}

/** Drive force at the rear contact that unloads the front tyre: m·g·b / h. */
export function wheelieThresholdForce(g: PitchGeometry): number {
  const { mass, gravity, comHeight, comToRear } = checked(g)
  return (mass * gravity * comToRear) / comHeight
}

/** Braking deceleration that unloads the rear tyre: g·a / h, m/s². */
export function stoppieThresholdDeceleration(g: PitchGeometry): number {
  const { gravity, comHeight, comToFront } = checked(g)
  return (gravity * comToFront) / comHeight
}

/**
 * Pitch angle where the centre of mass is straight above the contact the machine pivots on, the
 * loop-out point: atan(horizontal / height). Past it gravity no longer brings the wheel back.
 */
export function balancePointAngle(comHeight: number, horizontal: number): number {
  if (!(comHeight > 0) || !(horizontal > 0)) throw new Error('Expected positive lengths')
  return Math.atan2(horizontal, comHeight)
}

/**
 * Pitch of a chassis whose unit forward axis is `forward`, against the ground plane with unit
 * normal `groundNormal`: asin(forward · normal), nose up positive.
 */
export function measurePitch(forward: Vec3Like, groundNormal: Vec3Like): number {
  const length = Math.hypot(groundNormal[0], groundNormal[1], groundNormal[2])
  if (!(length > 1e-9)) return 0
  const along =
    (forward[0] * groundNormal[0] + forward[1] * groundNormal[1] + forward[2] * groundNormal[2]) /
    length
  return Math.asin(clamp(along, -1, 1))
}

export interface PitchAssistInput {
  /** Lift angle of the assisted manoeuvre, positive away from the ground (radians). */
  angle: number
  /** Rate of that angle, rad/s, positive while lifting further. */
  rate: number
  softAngle: number
  maxAngle: number
  /** Share of the force kept at `maxAngle`, 0..1 (0 = the force is fully faded out). */
  floor: number
  /** Natural frequency of the restoring correction past `maxAngle`, rad/s. */
  response: number
  dampingRatio: number
  /** Fastest rate back towards the ground before landing damping acts, rad/s (≥ 0). */
  landingRate: number
  /**
   * Seconds of look-ahead for the fade: it acts on `angle + rate · anticipation`, so a fast
   * rise is caught early and the held wheelie does not bounce between the two angles.
   */
  anticipation?: number
}

export interface PitchAssistOutput {
  /** Multiplier for the force that lifts the wheel (drive for a wheelie, front brake for a stoppie). */
  scale: number
  /**
   * Angular acceleration to add, rad/s², in the same sign convention as `angle`: negative pushes
   * the lifted wheel back down, positive slows a landing.
   */
  acceleration: number
}

const smoothstep = (low: number, high: number, x: number) => {
  if (!(high > low)) return x >= high ? 1 : 0
  const t = clamp((x - low) / (high - low), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Wheelie / stoppie assist for one tick. Below `softAngle` it does nothing. Between the soft
 * and the maximum angle (looking `anticipation` seconds ahead) the lifting force fades smoothly
 * to `floor`. Past `maxAngle` a
 * critically damped correction pulls the angle back to `maxAngle`. While the wheel comes back
 * down faster than `landingRate` the excess rate is damped, so a dropped wheelie lands softly.
 */
export function pitchAssist(input: PitchAssistInput): PitchAssistOutput {
  const { angle, rate, softAngle, maxAngle, floor, response, dampingRatio, landingRate } = input
  if (!(maxAngle > softAngle) || !(softAngle >= 0))
    throw new Error('Pitch assist needs 0 ≤ softAngle < maxAngle')
  if (!(angle > 0)) return { scale: 1, acceleration: 0 }
  const keep = clamp(floor, 0, 1)
  const ahead = angle + rate * Math.max(0, input.anticipation ?? 0)
  const scale = 1 - (1 - keep) * smoothstep(softAngle, maxAngle, ahead)
  let acceleration = 0
  if (angle > maxAngle)
    acceleration =
      -response * response * (angle - maxAngle) - 2 * dampingRatio * response * Math.max(0, rate)
  else if (rate < -landingRate) acceleration = 2 * dampingRatio * response * (-landingRate - rate)
  return { scale, acceleration }
}
