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
  /** Torque-cut time after D/R is engaged, seconds. */
  directionShiftSeconds?: number
  /** Sound of every gear change and D/R engagement. */
  clack?: GearClackProfile
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
  shift?: GearboxTuning
}
export interface WheeledDefinition {
  hubs:
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
}
/** Device-independent commands. Positive throttle drives forward; negative requests reverse/braking. */
export interface WheeledInput {
  throttle: number
  steering: number
  handbrake: boolean
  launch: boolean
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
  /** Counts audible changes only (D/R engagement, manual shifts); hosts play one clack per increase. */
  readonly clackCount: number
  /** True while torque is cut for a gear change or while D/R waits for standstill. */
  readonly shifting: boolean
  /** Clack sound of this vehicle; undefined uses the audio layer's car default. */
  readonly clack: GearClackProfile | undefined
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
