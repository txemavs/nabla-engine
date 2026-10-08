import type { TwoWheeledGeometry } from '../wheeled/contracts.js'

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
  wheelieGuard: boolean
  dragFactor: number
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
  /** Front and rear brake lever 0..1 applied on the last tick. */
  frontBrake: number
  rearBrake: number
  /** True while the wheelie guard cut the drive force on the last tick. */
  wheelieCut: boolean
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
}
