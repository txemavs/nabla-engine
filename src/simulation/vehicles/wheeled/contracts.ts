/** Metres, Y-up, front = -Z; front hubs 0/1, rear hubs 2/3. Plain configuration. */
export type WheelVector = [number, number, number]
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
