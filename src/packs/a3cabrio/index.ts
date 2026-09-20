/**
 * Audi A3 Cabrio pack.
 *
 * ## How to place a car (Engine)
 * 1. Model space: Y=0 ground contact, +X driver, +Y up, +Z forward.
 * 2. Physics COM at VehicleSpec.comY; modelFromBody = {-cabinX, rideY-comY, -cabinZ}.
 * 3. Body GLB under the model node with pack.meshAlign only
 *    (offset + yawDeg of the authored origin). No other Y hacks.
 * 4. Wheel GLBs are hub-centered; hubs at y = hubY in model space.
 *
 * A3: Agency FACTORY physics + identity meshAlign (GLB already matches).
 */
import type { CarPack, CarPackMounts, CarPackWheelPositions, MeshAlign } from '../../vehicle/carPack.js'
import { IDENTITY_MESH_ALIGN } from '../../vehicle/carPack.js'
import type { VehicleSpec } from '../../vehicle/vehicleSpec.js'
import { FACTORY_VEHICLE_SPEC } from '../../vehicle/vehicleSpec.js'

/** 1P eye position in body space (driver's head height, +X = driver side). */
export const A3_EYE_1P = { x: 0.356, y: 1.15, z: 0.0 } as const

/** Avatar position in body space — at the driver seat headrest. */
export const A3_AVATAR_MOUNT = { x: 0.356, y: 1.25, z: -0.32 } as const

/** Steering wheel mount in body space. */
export const A3_STEERING_MOUNT = {
  x: 0.356,
  y: 0.884,
  z: 0.311,
  restPitch: 25,  // degrees, wheel face tilts back from vertical
} as const

/** Height for chase/far/top focus point (body Y offset). */
export const A3_FOCUS_HEIGHT = 0.54

/**
 * Wheel radius = distance from hub (GLB origin) to tire sole = -minY of wheel mesh.
 * Measured from car.audi.a3.wheel.glb (hub-centered).
 */
export const A3_WHEEL_HUB_Y = 0.315374


/** A3 wheelbase (front to rear axle distance). */
export const A3_WHEELBASE = 2.58363

/** A3 front track width (left-right hub distance). */
export const A3_TRACK_FRONT = 1.524439

/** A3 rear track width (left-right hub distance). */
export const A3_TRACK_REAR = 1.509439

export const A3_HALF_WHEELBASE = A3_WHEELBASE / 2
export const A3_HALF_TRACK_FRONT = A3_TRACK_FRONT / 2
export const A3_HALF_TRACK_REAR = A3_TRACK_REAR / 2

/** Visual suspension travel limit (metres). */
export const A3_VISUAL_TRAVEL = 0.14

/** Physics + hub height: same mesh radius (hub on axle, sole on model Y=0). */
export const A3_WHEEL_RADIUS = A3_WHEEL_HUB_Y

/** Compute wheel hub positions in model space. */
export function a3WheelPositions(): CarPackWheelPositions {
  return {
    FL: { x: A3_HALF_TRACK_FRONT, y: A3_WHEEL_HUB_Y, z: A3_HALF_WHEELBASE },
    FR: { x: -A3_HALF_TRACK_FRONT, y: A3_WHEEL_HUB_Y, z: A3_HALF_WHEELBASE },
    RL: { x: A3_HALF_TRACK_REAR, y: A3_WHEEL_HUB_Y, z: -A3_HALF_WHEELBASE },
    RR: { x: -A3_HALF_TRACK_REAR, y: A3_WHEEL_HUB_Y, z: -A3_HALF_WHEELBASE },
  }
}

export const A3_MOUNTS: CarPackMounts = {
  eye1p: { ...A3_EYE_1P },
  avatar: { ...A3_AVATAR_MOUNT },
  focusHeight: A3_FOCUS_HEIGHT,
  steering: { ...A3_STEERING_MOUNT, mesh: { url: '/world/car.audi.a3.steering.glb' } },
}

export const A3_HUBS = {
  hubY: A3_WHEEL_HUB_Y,
  wheelbase: A3_WHEELBASE,
  trackFront: A3_TRACK_FRONT,
  trackRear: A3_TRACK_REAR,
  visualTravel: A3_VISUAL_TRAVEL,
}

export const A3_ASSETS = {
  body: { url: '/world/car.audi.a3.cabrio.glb' },
  wheel: { url: '/world/car.audi.a3.wheel.glb' },
  steering: { url: '/world/car.audi.a3.steering.glb' },
}

/** A3 VehicleSpec for Cannon physics. */
export const A3_SPEC: VehicleSpec = {
  ...FACTORY_VEHICLE_SPEC,
  mass: 1400,
  wheelbase: A3_WHEELBASE,
  radius: A3_WHEEL_RADIUS, // from wheel GLB, not factory 0.34
  rideY: 0.18, // a bit higher stance (FACTORY 0.12 was low for this mesh)
  headingDeg: 0,
}


/** Authored body GLB -> model space. A3 v6 already matches; change only this for a new car. */
export const A3_MESH_ALIGN: MeshAlign = { ...IDENTITY_MESH_ALIGN }

export const A3_CABRIO_PACK: CarPack = {
  id: 'a3cabrio',
  entityPrefix: 'world.car.audi.a3.',
  mounts: A3_MOUNTS,
  hubs: A3_HUBS,
  assets: A3_ASSETS,
  meshAlign: A3_MESH_ALIGN,
  wheelPositions: a3WheelPositions,
}

export default A3_CABRIO_PACK
