import type { TwoWheeledGeometry, TwoWheeledPitchAssistDefinition } from '../wheeled/contracts.js'
import type { BrakeLinkState, CombinedBrakeSplit } from './brakes.js'
import type { RiderLimits } from './rider.js'

/** Resolved rider counterweight: limits plus the seated centre of mass and body steering. */
export interface TwoWheeledRiderTuning extends RiderLimits {
  seat: [number, number, number]
  steer: number
}

/** Every two-wheeled tuning value resolved against `twoWheeledDefaults`. */
export interface TwoWheeledTuning {
  maxLean: number
  fallLean: number
  balanceSpeed: number
  balanceAssist: boolean
  leanResponse: number
  assistResponse: number
  leanDampingRatio: number
  maxLeanAcceleration: number
  disturbanceResponse: number
  steerRate: number
  frontBrakeForce: number
  rearBrakeForce: number
  frictionSlip: number
  dampingRelaxation: number
  dampingCompression: number
  dragFactor: number
  /** Wheelie / stoppie assist. */
  pitchAssist: TwoWheeledPitchAssistDefinition
  /** Rider counterweight, or null when the preset has no rider model. */
  rider: TwoWheeledRiderTuning | null
  /** Brake split; `independentBrakes` unless the preset declares `cbs`. */
  brakes: CombinedBrakeSplit
  /** True when the preset declared combined brakes. */
  combinedBrakes: boolean
  /** Clutch kick on Shift + throttle in a low gear. */
  clutchKick: { gain: number; seconds: number; maxGear: number }
}

/** Mutable controller state carried by a two-wheeled `Vehicle`. Angles are left-positive. */
export interface TwoWheeledState {
  readonly geometry: TwoWheeledGeometry
  readonly tuning: TwoWheeledTuning
  /** cos(rake) of the steering head axis. */
  readonly rakeCosine: number
  /** Unit steering head axis, chassis-local. */
  readonly steeringAxis: [number, number, number]
  /** Front-to-rear hub distance, metres. */
  readonly wheelbase: number
  /** Handlebar rotation about the steering axis, radians. */
  handlebar: number
  /** Front-wheel steer angle on the ground, radians. */
  groundSteer: number
  /** Measured lean from the gravity vertical, radians. */
  lean: number
  /** Lean the controller is tracking, radians. */
  targetLean: number
  /** True once the lean passed `fallLean`; balance stops until the machine is upright again. */
  fallen: boolean
  /** Brake controls on the last tick, 0..1: the hand lever and the foot pedal. */
  lever: number
  pedal: number
  /** Front and rear brake level 0..1 applied on the last tick (after CBS and the stoppie assist). */
  frontBrake: number
  rearBrake: number
  /** Linked (CBS) circuit state. */
  brakeLink: BrakeLinkState
  /**
   * Pitch against the ground under the wheel that is still down, radians, nose up positive and
   * zero at rest: positive is a wheelie, negative a stoppie.
   */
  pitch: number
  /** Pitch rate, rad/s (nose up positive). */
  pitchRate: number
  /** Raw ground-relative pitch with both wheels down (suspension squat), subtracted from `pitch`. */
  pitchReference: number
  previousPitch: number | null
  /** Drive multiplier from the wheelie assist and front-brake multiplier from the stoppie assist. */
  wheelieScale: number
  stoppieScale: number
  /** Rider offset from the seat, chassis-local [x, z] metres (+x right, +z back). */
  riderShift: [number, number]
  /** Centre-of-mass height above the ground on the last tick, metres. */
  comHeight: number
  /** Seconds left of the current clutch kick (0 = none). */
  clutchKick: number
  /** Launch input on the previous tick; a kick starts on the press, not while held. */
  launchHeld: boolean
  /** Roll disturbance observer estimate, rad/s². */
  disturbance: number
  /** Lean measured on the previous tick; the lean rate is differentiated from it. */
  previousLean: number | null
  /** Lean rate and commanded roll acceleration of the previous controlled tick. */
  previousLeanRate: number | null
  previousCommand: number
}

/** Visual articulation for one frame: angles in radians, compression in metres. */
export interface TwoWheeledPose {
  /** Handlebar rotation about the steering axis, left-positive. */
  steeringAngle: number
  /**
   * Suspension compression from the unloaded (authored) pose, metres; negative is extension.
   * Front: fork travel along the steering axis. Rear: vertical hub rise.
   */
  frontCompression: number
  rearCompression: number
  /** Accumulated wheel rotation about the axle, the same sign as car wheel visuals. */
  frontRoll: number
  rearRoll: number
  /** Measured lean, left-positive. */
  lean: number
  fallen: boolean
  /** Ground-relative pitch, nose up positive (wheelie > 0, stoppie < 0), radians. */
  pitch: number
  /** Rider offset from the seat, chassis-local [x, z] metres (+x right, +z back). */
  riderShift: [number, number]
}
