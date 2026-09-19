/**
 * Vehicle contracts. Persisted JSON stays ``VehicleSpec`` (desktop.vehicle).
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/vehicle/vehicleDef.ts
 *
 * Axes — do not flip
 *   metres, Y up. Cannon body origin = COM.
 *   +X right · +Y up · +Z forward at yaw 0.
 *   Engine: applyEngineForce(-throttle * F)  → +throttle increases +Z
 *   Steer:  setSteeringValue(-steer * max)   → +steer (D) decreases yaw
 *   indexRight=0  indexUp=1  indexForward=2
 *
 *        GLB nose (file origin)
 *              |
 *         +Z  (forward)
 *          ↑
 *      FL      FR
 *          |
 *         COM ●──── +X
 *          |
 *      RL      RR
 *          |
 *     low box (bottom ~12 cm above the plane; wheels are the contact)
 *
 *   modelFromBody  GLB origin in body frame
 *   cabinFromBody  camera / look-at in body frame (not the COM)
 */
import {
  DEFAULT_VEHICLE_SPEC,
  parseVehicleSpec,
  type VehicleSpec,
} from './vehicleSpec.js'

export type { VehicleSpec }
export { DEFAULT_VEHICLE_SPEC, parseVehicleSpec }

export type VehicleVec3 = { x: number; y: number; z: number }

export type VehicleGear = 'idle' | 'forward' | 'braking' | 'reverse'

export interface VehicleDefinition {
  mass: number
  size: VehicleVec3
  /** GLB origin relative to COM (body). */
  modelFromBody: VehicleVec3
  /** Camera / look-at relative to COM. */
  cabinFromBody: VehicleVec3
  /** Cabin in model (mesh) space — Drive cameras + parked pivot. */
  cabinModel: VehicleVec3
  comHeight: number
  wheelbase: number
  track: number
  radius: number
  restLength: number
  colliderHalf: VehicleVec3
  colliderOffset: VehicleVec3
  rideY: number
}

/** Live bag — changing these must not remount. */
export interface VehicleTune {
  maxForce: number
  reverseForce: number
  maxSteer: number
  steerRest: number
  brake: number
  stiffness: number
  travel: number
  damping: number
  frictionSlip: number
  /** Rear μ vs front. 1 = even. */
  rearGrip: number
  rollInfluence: number
  /** N·m per rad/s of local pitch/roll rate. */
  antiRollNm: number
}

export interface VehicleInput {
  throttle: number
  steer: number
  recover: boolean
  /** Space — rear lock. Tail grip drops (drift). */
  handbrake?: boolean
  /** Shift / blue pad — +50 CV only at WOT while rolling. */
  turbo?: boolean
}

export interface VehicleSnapshot {
  body: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number }
  ypr: { yaw: number; pitch: number; roll: number }
  velocity: { x: number; y: number; z: number }
  angular: { x: number; y: number; z: number }
  forwardSpeed: number
  gear: VehicleGear
  wheelsInContact: number
  suspension: [number, number, number, number]
  slip: [number, number, number, number]
  substeps: number
  dropped: boolean
  inverted: boolean
  engine: number
  steerRad: number
}

export type VehicleWheelId = 'FL' | 'FR' | 'RL' | 'RR'

export interface VehicleWheelDebug {
  id: VehicleWheelId
  conn: VehicleVec3
  center: VehicleVec3
  contact: VehicleVec3 | null
  inContact: boolean
  suspension: number
  slip: boolean
  steer: number
  engine: number
}

export interface VehicleDebugFrame {
  com: VehicleVec3
  mesh: VehicleVec3
  cabin: VehicleVec3
  axes: { x: VehicleVec3; y: VehicleVec3; z: VehicleVec3 }
  vel: VehicleVec3
  omega: VehicleVec3
  wheels: [VehicleWheelDebug, VehicleWheelDebug, VehicleWheelDebug, VehicleWheelDebug]
  engine: number
  steerRad: number
  gear: VehicleGear
  inertia: VehicleVec3
}

export const WHEEL_IDS: VehicleWheelId[] = ['FL', 'FR', 'RL', 'RR']

/** N·m per rad/s. Named arcade damper — not a hidden ω multiply. */
export const ANTI_ROLL_NM = 4200
/** N per metre of L−R suspension difference. Pair bar, front and rear. */
export const ANTI_ROLL_BAR_N_PER_M = 9000
/** Snap-upright lift above COM height. */
export const RECOVER_LIFT_M = 0.35
export const ROLLOVER_ROLL_DEG = 70
export const ROLLOVER_UP_DOT = 0.2
export const ROLLOVER_HOLD_FRAMES = 10
/** Still going forward — brake only, no reverse force. */
export const BRAKE_TO_REVERSE_MPS = 1.2
/** Space handbrake vs ``tune.brake``. Rear locks; front stays light. */
export const HANDBRAKE_FRONT = 0.18
export const HANDBRAKE_REAR = 2.6
/** Factory 100 CV = 3200 N. Nitro is +50 CV, not a parked shove. */
export const TURBO_HP = 50
export const TURBO_FORCE_N = 1600
export const TURBO_WOT = 0.9
export const TURBO_MIN_SPEED_MPS = 3
/** Rear μ while the handbrake is down. */
export const DRIFT_REAR_GRIP = 0.28
/** Defer structural rebuild above this speed. */
export const REMOUNT_MAX_SPEED = 0.3
/** Collider underside clearance (m). */
export const COLLIDER_CLEARANCE_M = 0.32

export const STEP = 1 / 60
export const MAX_SUB = 4

export function specToDefinition(spec: VehicleSpec): VehicleDefinition {
  const s = parseVehicleSpec(spec)
  const halfY = Math.max(0.1, Math.min(s.comY * 0.4, 0.2))
  const offsetY = COLLIDER_CLEARANCE_M - s.comY + halfY
  return {
    mass: s.mass,
    size: { x: s.sizeX, y: s.sizeY, z: s.sizeZ },
    modelFromBody: { x: -s.cabinX, y: s.rideY - s.comY, z: -s.cabinZ },
    cabinFromBody: { x: 0, y: s.cabinY + s.rideY - s.comY, z: 0 },
    cabinModel: { x: s.cabinX, y: s.cabinY, z: s.cabinZ },
    comHeight: s.comY,
    wheelbase: s.wheelbase,
    track: s.sizeX * 0.46,
    radius: s.radius,
    restLength: s.restLength,
    colliderHalf: { x: s.sizeX / 2, y: halfY, z: s.sizeZ / 2 },
    colliderOffset: { x: 0, y: offsetY, z: 0 },
    rideY: s.rideY,
  }
}

export function specToTune(spec: VehicleSpec): VehicleTune {
  const s = parseVehicleSpec(spec)
  return {
    maxForce: s.maxForce,
    reverseForce: s.reverseForce,
    maxSteer: s.maxSteer,
    steerRest: s.steerRest,
    brake: s.brake,
    stiffness: s.stiffness,
    travel: s.travel,
    damping: s.damping,
    frictionSlip: s.frictionSlip,
    rearGrip: s.rearGrip,
    rollInfluence: s.rollInfluence,
    antiRollNm: s.antiRollNm,
  }
}

/** Inertia from the visual hull, not the pancake collider. */
export function chassisInertia(def: VehicleDefinition): VehicleVec3 {
  const m = def.mass
  const x = def.size.x
  const y = def.size.y
  const z = def.size.z
  return {
    x: (m / 12) * (y * y + z * z),
    y: (m / 12) * (x * x + z * z),
    z: (m / 12) * (x * x + y * y),
  }
}

export function definitionNeedsRemount(a: VehicleDefinition, b: VehicleDefinition): boolean {
  return (
    a.mass !== b.mass ||
    a.size.x !== b.size.x ||
    a.size.y !== b.size.y ||
    a.size.z !== b.size.z ||
    a.wheelbase !== b.wheelbase ||
    a.radius !== b.radius ||
    a.restLength !== b.restLength ||
    a.modelFromBody.x !== b.modelFromBody.x ||
    a.modelFromBody.y !== b.modelFromBody.y ||
    a.modelFromBody.z !== b.modelFromBody.z ||
    a.comHeight !== b.comHeight ||
    a.colliderHalf.x !== b.colliderHalf.x ||
    a.colliderHalf.y !== b.colliderHalf.y ||
    a.colliderHalf.z !== b.colliderHalf.z
  )
}

export function emptySnapshot(): VehicleSnapshot {
  return {
    body: { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
    ypr: { yaw: 0, pitch: 0, roll: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
    forwardSpeed: 0,
    gear: 'idle',
    wheelsInContact: 0,
    suspension: [0, 0, 0, 0],
    slip: [0, 0, 0, 0],
    substeps: 0,
    dropped: false,
    inverted: false,
    engine: 0,
    steerRad: 0,
  }
}

export function emptyDebugFrame(): VehicleDebugFrame {
  const z = { x: 0, y: 0, z: 0 }
  const wheel = (id: VehicleWheelId): VehicleWheelDebug => ({
    id,
    conn: { ...z },
    center: { ...z },
    contact: null,
    inContact: false,
    suspension: 0,
    slip: false,
    steer: 0,
    engine: 0,
  })
  return {
    com: { ...z },
    mesh: { ...z },
    cabin: { ...z },
    axes: { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } },
    vel: { ...z },
    omega: { ...z },
    wheels: [wheel('FL'), wheel('FR'), wheel('RL'), wheel('RR')],
    engine: 0,
    steerRad: 0,
    gear: 'idle',
    inertia: { ...z },
  }
}

export const A3_DEFINITION = specToDefinition(DEFAULT_VEHICLE_SPEC)
export const A3_TUNE = specToTune(DEFAULT_VEHICLE_SPEC)
