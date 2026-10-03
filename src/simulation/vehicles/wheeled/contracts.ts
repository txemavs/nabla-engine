/** Metres, Y-up, front = -Z; front hubs 0/1, rear hubs 2/3. Plain configuration. */
export type WheelVector = [number, number, number]
export interface PowertrainDefinition {
  powerCv: number
  torqueNm: number
  ratios: number[]
  finalDrive: number
  grip: number
}
/** Per-hub configuration for N-wheel vehicles (trucks, trailers). */
export interface HubDefinition {
  position: WheelVector
  steered?: boolean
  driven?: boolean
  radius?: number
}
/**
 * Wheeled vehicle definition. Supports both legacy 4-tuple hubs and extended N-hub configurations.
 * For 4-wheel vehicles, hubs can be a 4-tuple with drivenWheels selecting the axle.
 * For N-wheel vehicles, use hubConfigs with per-hub steering/driven flags.
 */
export interface WheeledDefinition {
  /** Legacy 4-wheel format: front hubs 0/1 steer, drivenWheels selects driven axle. */
  hubs?: [WheelVector, WheelVector, WheelVector, WheelVector]
  /** Extended format: per-hub configuration for N wheels. Overrides hubs if both present. */
  hubConfigs?: HubDefinition[]
  wheelRadius: number
  suspensionRest: number
  suspensionTravel?: number
  stiffness: number
  engineForce: number
  brakeForce: number
  /** Legacy driven-axle selector for 4-wheel vehicles. Ignored if hubConfigs is used. */
  drivenWheels?: 'front' | 'rear' | 'all'
  powertrain?: PowertrainDefinition
}
/** Normalize definition to array of hub configs for runtime use. */
export function normalizeHubs(def: WheeledDefinition): HubDefinition[] {
  if (def.hubConfigs) return def.hubConfigs
  if (!def.hubs) throw new Error('WheeledDefinition requires hubs or hubConfigs')
  const driven = def.drivenWheels ?? 'rear'
  return def.hubs.map((pos, i) => ({
    position: pos,
    steered: i < 2,
    driven: driven === 'all' || (driven === 'front' ? i < 2 : i >= 2),
    radius: def.wheelRadius,
  }))
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
