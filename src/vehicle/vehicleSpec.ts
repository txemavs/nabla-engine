/**
 * VehicleSpec — persisted vehicle tuning bag.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/vehicle/vehicleSpec.ts (not provided — stubbed from vehicleDef.ts usage)
 *
 * This is a minimal stub with defaults extracted from vehicleDef.ts patterns.
 * The full vehicleSpec.ts was not attached; this provides just enough for
 * specToDefinition() and specToTune() to work.
 */

export interface VehicleSpec {
  mass?: number
  sizeX?: number
  sizeY?: number
  sizeZ?: number
  comY?: number
  wheelbase?: number
  radius?: number
  restLength?: number
  rideY?: number
  cabinX?: number
  cabinY?: number
  cabinZ?: number
  maxForce?: number
  reverseForce?: number
  maxSteer?: number
  steerRest?: number
  brake?: number
  stiffness?: number
  travel?: number
  damping?: number
  frictionSlip?: number
  rearGrip?: number
  rollInfluence?: number
  antiRollNm?: number
}

/** A3 Cabrio defaults — the reference vehicle. */
export const DEFAULT_VEHICLE_SPEC: Required<VehicleSpec> = {
  mass: 1400,
  sizeX: 1.8,
  sizeY: 1.4,
  sizeZ: 4.3,
  comY: 0.45,
  wheelbase: 2.56,
  radius: 0.32,
  restLength: 0.15,
  rideY: 0.12,
  cabinX: 0,
  cabinY: 0.9,
  cabinZ: 1.2,
  maxForce: 3200,
  reverseForce: 2000,
  maxSteer: 0.52,
  steerRest: 0.08,
  brake: 36,
  stiffness: 38000,
  travel: 0.16,
  damping: 3200,
  frictionSlip: 2.8,
  rearGrip: 1.0,
  rollInfluence: 0.12,
  antiRollNm: 4200,
}

export function parseVehicleSpec(spec?: VehicleSpec | null): Required<VehicleSpec> {
  const d = DEFAULT_VEHICLE_SPEC
  if (!spec) return { ...d }
  return {
    mass: spec.mass ?? d.mass,
    sizeX: spec.sizeX ?? d.sizeX,
    sizeY: spec.sizeY ?? d.sizeY,
    sizeZ: spec.sizeZ ?? d.sizeZ,
    comY: spec.comY ?? d.comY,
    wheelbase: spec.wheelbase ?? d.wheelbase,
    radius: spec.radius ?? d.radius,
    restLength: spec.restLength ?? d.restLength,
    rideY: spec.rideY ?? d.rideY,
    cabinX: spec.cabinX ?? d.cabinX,
    cabinY: spec.cabinY ?? d.cabinY,
    cabinZ: spec.cabinZ ?? d.cabinZ,
    maxForce: spec.maxForce ?? d.maxForce,
    reverseForce: spec.reverseForce ?? d.reverseForce,
    maxSteer: spec.maxSteer ?? d.maxSteer,
    steerRest: spec.steerRest ?? d.steerRest,
    brake: spec.brake ?? d.brake,
    stiffness: spec.stiffness ?? d.stiffness,
    travel: spec.travel ?? d.travel,
    damping: spec.damping ?? d.damping,
    frictionSlip: spec.frictionSlip ?? d.frictionSlip,
    rearGrip: spec.rearGrip ?? d.rearGrip,
    rollInfluence: spec.rollInfluence ?? d.rollInfluence,
    antiRollNm: spec.antiRollNm ?? d.antiRollNm,
  }
}
