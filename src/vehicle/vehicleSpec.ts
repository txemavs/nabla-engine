/**
 * VehicleSpec — persisted vehicle tuning bag.
 *
 * Full port from Agency (txemavs/agency-ui) stage/vehicle/vehicleSpec.ts.
 * All fields required, with Agency-compatible bounds and defaults.
 *
 * Units: metres, radians (steer angles), Newtons, N·m.
 */

export interface VehicleSpec {
  mass: number
  sizeX: number
  sizeY: number
  sizeZ: number
  wheelbase: number
  maxForce: number
  reverseForce: number
  /** Max steer angle at speed (radians). */
  maxSteer: number
  /** Lock at rest (rad). Bigger than maxSteer → tighter park. */
  steerRest: number
  brake: number
  stiffness: number
  restLength: number
  travel: number
  damping: number
  frictionSlip: number
  /** Rear μ vs front. 1 = even. Drift mode drops this; Space still locks. */
  rearGrip: number
  rollInfluence: number
  radius: number
  cabinX: number
  cabinY: number
  cabinZ: number
  /** Mesh origin above the plane so tyres sit on the ground, not in it. */
  rideY: number
  /** Chassis COM height above the plane. High COM + A/D = rollover. */
  comY: number
  /** N·m per rad/s of local pitch/roll rate. */
  antiRollNm: number
  /**
   * Mesh forward vs chassis +Z. 180 = GLB proa is −Z (5×10).
   * Controls and chase look use this; stored yaw stays the mesh.
   */
  headingDeg: number
}

/** Frozen A3 factory — 100 CV. The reference car. */
export const FACTORY_VEHICLE_SPEC: VehicleSpec = {
  mass: 1400,
  sizeX: 1.8,
  sizeY: 1.4,
  sizeZ: 4.2,
  wheelbase: 2.6,
  maxForce: 3200,
  reverseForce: 2200,
  maxSteer: 0.38,
  steerRest: 0.72,
  brake: 80,
  stiffness: 18,
  restLength: 0.5,
  travel: 0.64,
  damping: 1.4,
  frictionSlip: 2.4,
  rearGrip: 1,
  rollInfluence: 0.04,
  radius: 0.34,
  cabinX: 0.4,
  cabinY: 0.54,
  cabinZ: 0.9,
  rideY: 0.12,
  comY: 0.48,
  headingDeg: 0,
  antiRollNm: 4200,
}

export const DEFAULT_VEHICLE_SPEC: VehicleSpec = { ...FACTORY_VEHICLE_SPEC }

/** 5×10 floating container — slides on the lot, soft bob. */
export const CONTAINER_SPEC: VehicleSpec = {
  mass: 8500,
  sizeX: 5,
  sizeY: 3.2,
  sizeZ: 10,
  wheelbase: 8.2,
  maxForce: 7200,
  reverseForce: 5600,
  maxSteer: 0.62,
  steerRest: 0.95,
  brake: 36,
  stiffness: 14,
  restLength: 0.5,
  travel: 0.45,
  damping: 1.6,
  frictionSlip: 0.85,
  rearGrip: 1,
  rollInfluence: 0.02,
  radius: 0.38,
  cabinX: 0,
  cabinY: 1.55,
  cabinZ: 0,
  rideY: 0.28,
  comY: 0.55,
  antiRollNm: 24000,
  headingDeg: 180,
}

const NUM: Record<keyof VehicleSpec, { min: number; max: number }> = {
  mass: { min: 400, max: 28000 },
  sizeX: { min: 1, max: 6 },
  sizeY: { min: 0.6, max: 4 },
  sizeZ: { min: 2.4, max: 12 },
  wheelbase: { min: 1.4, max: 10 },
  maxForce: { min: 400, max: 40000 },
  reverseForce: { min: 200, max: 20000 },
  maxSteer: { min: 0.08, max: 1.1 },
  steerRest: { min: 0.06, max: 1.1 },
  brake: { min: 10, max: 400 },
  stiffness: { min: 8, max: 120 },
  restLength: { min: 0.08, max: 0.7 },
  travel: { min: 0.06, max: 0.7 },
  damping: { min: 0.4, max: 8 },
  frictionSlip: { min: 0.4, max: 12 },
  rearGrip: { min: 0.15, max: 1.2 },
  rollInfluence: { min: 0, max: 1 },
  radius: { min: 0.18, max: 0.55 },
  cabinX: { min: -0.5, max: 2.2 },
  cabinY: { min: 0.2, max: 3 },
  cabinZ: { min: -5, max: 5 },
  rideY: { min: 0, max: 0.6 },
  comY: { min: 0.28, max: 2 },
  antiRollNm: { min: 0, max: 30000 },
  headingDeg: { min: -180, max: 180 },
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return Math.max(min, Math.min(max, v))
}

export function parseVehicleSpec(raw: unknown): VehicleSpec {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = { ...DEFAULT_VEHICLE_SPEC }
  for (const key of Object.keys(NUM) as (keyof VehicleSpec)[]) {
    const bound = NUM[key]
    out[key] = clamp(o[key], bound.min, bound.max, DEFAULT_VEHICLE_SPEC[key])
  }
  return out
}

export function vehicleSpecBounds(key: keyof VehicleSpec): { min: number; max: number } {
  return NUM[key]
}
