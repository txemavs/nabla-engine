import type { AutoRiderSettings, RiderTuckSettings } from '../two-wheeled/rider.js'
/** Metres, Y-up, front = -Z; front hubs 0/1, rear hubs 2/3. Plain configuration. */
export type WheelVector = [number, number, number]
/**
 * Synthesized gear-change sound ("clack"). Every field is optional; omitted fields use the
 * light road-car sound. A truck lowers `clunkHz`/`clickHz`, lengthens the decays and adds air.
 * The audio layer renders it; the simulation only carries the numbers.
 */
export interface GearClackProfile {
  /** Body of the thump, Hz. Car ~150, truck ~60. */
  clunkHz?: number
  /** Centre of the metallic click band, Hz. Car ~2400, truck ~900. */
  clickHz?: number
  /** Loudness multiplier, 0..2. */
  gain?: number
  /** Decay of the main hit, seconds. */
  decaySeconds?: number
  /** Delay of the second (engagement) hit, seconds. 0 disables it. */
  echoSeconds?: number
  /** Length of an air-release hiss after the hit, seconds. 0 disables it (cars). */
  airSeconds?: number
}
/** Gearbox feel. Omitted fields use `roadVehicleDefaults`; rpm limits derive from `maxRpm`. */
export interface GearboxTuning {
  /** Torque-cut time of a gear change, seconds. */
  seconds?: number
  /** Minimum time between two automatic changes, seconds. */
  cooldownSeconds?: number
  /** Automatic upshift above this engine speed, rpm. Default 92.8 % of maxRpm. */
  upshiftRpm?: number
  /** Automatic downshift below this engine speed, rpm. Default one third of maxRpm. */
  downshiftRpm?: number
  /** Share of the throttle that reaches the wheels during a change, 0..1. */
  torqueFraction?: number
  /** Engine speed response, 1/s. Lower values fall and rise more slowly. */
  rpmResponse?: number
  /**
   * Engine speed of a fully pressed pedal at rest, rpm. When set, this floor only applies in
   * first and reverse gear; omitted keeps the car's floor in every gear.
   */
  launchRpm?: number
  /** Standstill dwell before D/R is engaged, seconds. */
  directionSeconds?: number
  /** Seconds stopped with the handbrake on and no pedal before D/R drops to N. */
  neutralSeconds?: number
  /** Further seconds stopped in N with the handbrake on before P engages. */
  parkSeconds?: number
  /** Torque-cut time after D/R is engaged, seconds. */
  directionShiftSeconds?: number
  /** Sound of every gear change and D/R engagement. */
  clack?: GearClackProfile
}
/** See `PowertrainDefinition.speedLimiter`. */
export interface SpeedLimiterDefinition {
  kmh: number
  /** Default `roadVehicleDefaults.limiterHysteresisKmh`. */
  hysteresisKmh?: number
}
export interface PowertrainDefinition {
  powerCv: number
  torqueNm: number
  ratios: number[]
  finalDrive: number
  grip: number
  /** Optional engine operating range and governed forward speed, rpm and km/h. */
  idleRpm?: number
  maxRpm?: number
  reverseRatio?: number
  maxSpeedKmh?: number
  /** Traction/clutch limit on the force at the wheels, newtons. Omitted: torque limited only. */
  maxWheelForceN?: number
  /**
   * Soft rev/speed limiter: an ignition-style cut. At `kmh` the drive is cut until the speed
   * falls `hysteresisKmh` below it, then it comes back, so the vehicle hovers at the limit with
   * a slight stutter instead of hitting a wall. `maxSpeedKmh` is the older hard governor.
   */
  speedLimiter?: SpeedLimiterDefinition
  shift?: GearboxTuning
}
/** One side of the full lean: the touch-down lean, radians, and the touching point (chassis m). */
export interface TwoWheeledPegSide {
  lean: number
  point: [number, number, number]
}

/** Full lean ("total estribo"); see `vehicle.twoWheeled.pegLean`. */
export interface TwoWheeledPegLeanDefinition {
  left: TwoWheeledPegSide
  right: TwoWheeledPegSide
  seconds?: number
  relaxSeconds?: number
  steer?: number
}

/**
 * Single-track geometry and tuning; see `vehicle.twoWheeled` in `entity/vehicle/field.ts`.
 * Omitted tuning uses `twoWheeledDefaults`.
 */
export interface TwoWheeledGeometry {
  rearWheelRadius: number
  steeringAxis: [number, number, number]
  steerLimit: number
  maxLean?: number
  fallLean?: number
  /** Full lean per side (`vehicle.twoWheeled.pegLean`). */
  pegLean?: TwoWheeledPegLeanDefinition
  balanceSpeed?: number
  balanceAssist?: boolean
  leanResponse?: number
  assistResponse?: number
  maxLeanAcceleration?: number
  steerRate?: number
  frontBrakeForce?: number
  rearBrakeForce?: number
  frictionSlip?: number
  /** Rider counterweight; omitted = no rider model (fixed centre of mass). */
  rider?: TwoWheeledRiderDefinition
  /** Wheelie / stoppie assist overrides (`twoWheeledDefaults.pitchAssist`). */
  pitchAssist?: Partial<TwoWheeledPitchAssistDefinition>
  /** Clutch kick overrides (`twoWheeledDefaults.clutchKick`). */
  clutchKick?: Partial<{ gain: number; seconds: number; maxGear: number }>
  /** Combined braking; omitted = independent front lever and rear pedal. */
  cbs?: Partial<TwoWheeledCbsDefinition>
  /** Shift hooligan modifier overrides (`twoWheeledDefaults.hooligan`). */
  hooligan?: Partial<TwoWheeledHooliganDefinition>
  /** Pitch that counts as a crash, radians (`twoWheeledDefaults.crashPitch`). */
  crashPitch?: number
}
export interface TwoWheeledHooliganDefinition {
  enabled: boolean
  burnoutSpeed: number
  burnoutFade: number
  spinSpeed: number
  spinRate: number
  burnoutTraction: number
  slide: number
  wheelieDrive: number
  wheelieRate: number
  stoppieBrake: number
  stoppieRate: number
  riseResponse: number
  wheelieRiderBack: number
}
export interface TwoWheeledRiderDefinition {
  /** Seated rider centre of mass, chassis-local metres. */
  seat: [number, number, number]
  mass?: number
  lateral?: number
  forward?: number
  back?: number
  rate?: number
  steer?: number
  /** Automatic rider overrides (`twoWheeledDefaults.rider.auto`). */
  auto?: Partial<AutoRiderSettings>
  /** Tuck overrides (`twoWheeledDefaults.rider.tuck`). */
  tuck?: Partial<RiderTuckSettings>
}
export interface TwoWheeledPitchAssistDefinition {
  wheelie: boolean
  wheelieSoftAngle: number
  wheelieMaxAngle: number
  wheelieNeutralAngle: number
  stoppie: boolean
  stoppieSoftAngle: number
  stoppieMaxAngle: number
  stoppieNeutralAngle: number
  stoppieMinBrake: number
  response: number
  dampingRatio: number
  landingRate: number
  anticipation: number
}
export interface TwoWheeledCbsDefinition {
  leverFront: number
  leverRear: number
  pedalFront: number
  pedalRear: number
  linkLag: number
}
export interface WheeledDefinition {
  hubs:
    | [WheelVector, WheelVector]
    | [WheelVector, WheelVector, WheelVector, WheelVector]
    | [WheelVector, WheelVector, WheelVector, WheelVector, WheelVector, WheelVector]
  passive?: boolean
  wheelRadius: number
  suspensionRest: number
  suspensionTravel?: number
  stiffness: number
  engineForce: number
  brakeForce: number
  drivenWheels?: 'front' | 'rear' | 'all'
  powertrain?: PowertrainDefinition
  /** Present on a two-wheeler; such a definition is driven by `createTwoWheeledVehicle`. */
  twoWheeled?: TwoWheeledGeometry
}
/** Device-independent commands. Positive throttle drives forward; negative requests reverse/braking. */
export interface WheeledInput {
  throttle: number
  steering: number
  handbrake: boolean
  launch: boolean
  /**
   * Rider counterweight on a two-wheeler: `right` −1 (hang off left) … +1 (right), `forward`
   * −1 (sit back) … +1 (over the tank). Other vehicles ignore it.
   */
  rider?: { right: number; forward: number }
  /**
   * Two-wheelers: front lever held separately from the throttle (S together with W while Shift
   * is held), 0..1. Other vehicles ignore it.
   */
  lever?: number
}
export const idleWheeledInput = (): WheeledInput => ({
  throttle: 0,
  steering: 0,
  handbrake: false,
  launch: false,
})
export interface WheeledTelemetry {
  readonly speedMps: number
  readonly signedSpeedMps: number
  readonly steer: number
  readonly rpm: number
  readonly gear: number
  readonly manualTransmission: boolean
  readonly engineLoad: number
  readonly braking: boolean
  readonly reversing: boolean
  readonly tireSlip: number
  /** Counts every gear change (automatic, manual) and D/R engagement. */
  readonly shiftCount: number
  /** True in P: gear is 0 and the vehicle is held by its brakes. */
  readonly parked: boolean
  /** Counts audible changes only (D/R engagement, manual shifts); hosts play one clack per increase. */
  readonly clackCount: number
  /** True while torque is cut for a gear change or while D/R waits for standstill. */
  readonly shifting: boolean
  /** Clack sound of this vehicle; undefined uses the audio layer's car default. */
  readonly clack: GearClackProfile | undefined
  /** Start-up phase after entering: `cranking`, `sweep` (needle self-test), then `running`. */
  readonly ignition: 'cranking' | 'sweep' | 'running'
  /** Increments on every start-up; hosts play one starter sound per increase. */
  readonly ignitionCount: number
  /** Needle self-test position 0..1 during `sweep`, else 0. Dials show this fraction of full scale. */
  readonly gaugeSweep: number
}
/** Fresh copies in absolute physics-world metres, before render-origin subtraction. */
export interface WheelContactSnapshot {
  readonly wheelCenter: WheelVector
  readonly contactPoint: WheelVector | null
  readonly contactNormal: WheelVector | null
  readonly slip: number
  readonly suspensionLength: number
  readonly isInContact: boolean
}
