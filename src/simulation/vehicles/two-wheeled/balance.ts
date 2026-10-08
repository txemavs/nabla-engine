/**
 * Pure single-track geometry and lean/balance math. No physics world, no renderer.
 *
 * Sign convention: steering and lean angles are positive to the LEFT (the Rapier steering sign:
 * a positive front-wheel angle turns the nose towards −X). Player steering input stays
 * positive to the right, as everywhere else in the engine. Angles are radians, speeds m/s.
 */
type Vec3Like = readonly [number, number, number]

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))
const dot = (a: Vec3Like, b: Vec3Like) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3Like, b: Vec3Like): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const normalize = (v: Vec3Like): [number, number, number] => {
  const length = Math.hypot(v[0], v[1], v[2])
  return length > 1e-12 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0]
}

/** Cosine of the rake: angle between the steering head axis and the chassis up axis (+Y). */
export function steeringRakeCosine(axis: Vec3Like): number {
  const length = Math.hypot(axis[0], axis[1], axis[2])
  if (!(length > 1e-9)) throw new Error('Steering axis must not be zero')
  return clamp(axis[1] / length, 0.05, 1)
}

/**
 * Front-wheel steer angle on the ground for a handlebar rotation about a raked steering axis
 * (upright machine): tan(ground) = tan(handlebar)·cos(rake).
 */
export function groundSteerAngle(handlebar: number, rakeCosine: number): number {
  return Math.atan(Math.tan(clamp(handlebar, -1.5, 1.5)) * rakeCosine)
}

/** Inverse of `groundSteerAngle`. */
export function handlebarForGroundSteer(ground: number, rakeCosine: number): number {
  return Math.atan(Math.tan(clamp(ground, -1.5, 1.5)) / rakeCosine)
}

/**
 * Steady-turn lean for a kinematic (no tyre slip) single-track path: yaw rate
 * ω = v·tan(Δ)/L, and gravity balances the centripetal load when tan(φ) = v·ω/g.
 */
export function equilibriumLean(
  speed: number,
  groundSteer: number,
  wheelbase: number,
  gravity: number,
): number {
  if (!(wheelbase > 0) || !(gravity > 0)) throw new Error('Wheelbase and gravity must be positive')
  return Math.atan((speed * speed * Math.tan(groundSteer)) / (gravity * wheelbase))
}

/** Largest ground steer angle whose steady turn stays within `maxLean` at `speed`. */
export function groundSteerLimitForLean(
  speed: number,
  wheelbase: number,
  maxLean: number,
  gravity: number,
): number {
  const v2 = speed * speed
  if (v2 < 1e-9) return Math.PI / 2
  return Math.atan((gravity * wheelbase * Math.tan(maxLean)) / v2)
}

export interface HandlebarLimits {
  /** Mechanical handlebar lock each side, radians. */
  steerLimit: number
  maxLean: number
  rakeCosine: number
  wheelbase: number
  gravity: number
}

/**
 * Handlebar target for a normalized player input (+1 = full right). At walking pace the full
 * lock is available; with speed the reachable angle shrinks so a full input asks for exactly
 * `maxLean`, never more. Returns the left-positive handlebar angle.
 */
export function handlebarTarget(steering: number, speed: number, limits: HandlebarLimits): number {
  const ground = groundSteerLimitForLean(speed, limits.wheelbase, limits.maxLean, limits.gravity)
  const reachable = Math.min(limits.steerLimit, handlebarForGroundSteer(ground, limits.rakeCosine))
  return -clamp(steering, -1, 1) * reachable
}

export interface LeanTargetInput {
  speed: number
  groundSteer: number
  wheelbase: number
  gravity: number
  maxLean: number
}

/** Lean the rider model aims for: the steady-turn lean, limited to ±maxLean. */
export function targetLean(input: LeanTargetInput): number {
  const lean = equilibriumLean(input.speed, input.groundSteer, input.wheelbase, input.gravity)
  return clamp(lean, -input.maxLean, input.maxLean)
}

export interface BalanceGains {
  balanceSpeed: number
  leanResponse: number
  assistResponse: number
}

/**
 * Lean controller natural frequency: the stiffer assist below `balanceSpeed`, the riding value
 * above twice that, blended in between so nothing jumps.
 */
export function leanControlFrequency(speed: number, gains: BalanceGains): number {
  const low = gains.balanceSpeed,
    high = gains.balanceSpeed * 2
  const t = high > low ? clamp((Math.abs(speed) - low) / (high - low), 0, 1) : 1
  return gains.assistResponse + (gains.leanResponse - gains.assistResponse) * t
}

/** True while the controller should act: assist on, or fast enough to be self-balanced. */
export function balanceActive(
  speed: number,
  fallen: boolean,
  assist: boolean,
  balanceSpeed: number,
): boolean {
  return !fallen && (assist || Math.abs(speed) >= balanceSpeed)
}

export interface LeanCommandInput {
  lean: number
  leanRate: number
  target: number
  /** Natural frequency, rad/s. */
  frequency: number
  dampingRatio: number
  /** Estimated external roll acceleration (tyres, gravity), rad/s²; cancelled. */
  disturbance: number
  maxAcceleration: number
}

/**
 * Second-order lean tracking: α = ω²(target − φ) − 2ζω·φ̇ − d, limited to ±maxAcceleration.
 * Multiply by the roll inertia for the torque. Left-positive like the lean.
 */
export function leanAcceleration(input: LeanCommandInput): number {
  const w = input.frequency
  const raw =
    w * w * (input.target - input.lean) -
    2 * input.dampingRatio * w * input.leanRate -
    input.disturbance
  return clamp(raw, -input.maxAcceleration, input.maxAcceleration)
}

/**
 * One step of the roll disturbance observer: the roll acceleration measured over the last tick
 * minus what the controller commanded is what the tyres and gravity added. Low-passed at
 * `response` (1/s) and bounded so a crash cannot wind it up.
 */
export function updateDisturbance(
  previous: number,
  measuredAcceleration: number,
  commandedAcceleration: number,
  dt: number,
  response: number,
  bound: number,
): number {
  if (!(dt > 0)) return previous
  const sample = clamp(measuredAcceleration - commandedAcceleration, -bound, bound)
  return previous + (sample - previous) * (1 - Math.exp(-response * dt))
}

export interface LeanMeasurement {
  /** Lean from the gravity vertical, left-positive, radians. */
  lean: number
  /** Unit forward direction in the horizontal plane (the roll axis). */
  heading: [number, number, number]
  /** Unit right direction in the horizontal plane. */
  right: [number, number, number]
}

/**
 * Lean of a chassis whose forward (−Z) and up (+Y) axes are given in world space, against the
 * gravity up vector. A nose pointing straight up or down has no defined lean (0).
 */
export function measureLean(forward: Vec3Like, up: Vec3Like, gravityUp: Vec3Like): LeanMeasurement {
  const g = normalize(gravityUp)
  const along = dot(forward, g)
  const heading = normalize([
    forward[0] - g[0] * along,
    forward[1] - g[1] * along,
    forward[2] - g[2] * along,
  ])
  const right = normalize(cross(heading, g))
  if (heading.every((value) => value === 0)) return { lean: 0, heading, right }
  return { lean: Math.atan2(-dot(up, right), dot(up, g)), heading, right }
}

/** Left-positive roll rate about the horizontal heading, rad/s. */
export function leanRate(angularVelocity: Vec3Like, heading: Vec3Like): number {
  return -dot(angularVelocity, heading)
}
