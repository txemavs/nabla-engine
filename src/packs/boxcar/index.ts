/**
 * Boxcar pack — minimal procedural car for the drive playground.
 *
 * Implements CarPack interface with Agency-compatible mounts and hubs.
 * No GLB required — geometry is generated procedurally in the playground renderer.
 *
 * Body frame: metres, Y-up. Origin at geometric center / hub line.
 * +X right, +Y up, +Z forward.
 */
import type { CarPack, CarPackMounts, CarPackHubs, CarPackWheelPositions, CarPackAssets } from '../../vehicle/carPack.js'
import type { VehicleSpec } from '../../vehicle/vehicleSpec.js'
import { FACTORY_VEHICLE_SPEC } from '../../vehicle/vehicleSpec.js'

export const BOXCAR_ENTITY_PREFIX = 'world.car.boxcar.'
export const BOXCAR_ID = 'boxcar'

export const BOXCAR_SIZE = {
  x: 1.8,
  y: 1.2,
  z: 4.0,
} as const

export const BOXCAR_WHEELBASE = 2.4
export const BOXCAR_TRACK_FRONT = 1.5
export const BOXCAR_TRACK_REAR = 1.5
export const BOXCAR_WHEEL_RADIUS = 0.32
export const BOXCAR_HUB_Y = 0.32

export const BOXCAR_EYE_1P = { x: 0.35, y: 1.0, z: 0.2 } as const
export const BOXCAR_AVATAR_MOUNT = { x: 0.35, y: 1.1, z: -0.1 } as const
export const BOXCAR_FOCUS_HEIGHT = 0.5

export const BOXCAR_MOUNTS: CarPackMounts = {
  eye1p: { ...BOXCAR_EYE_1P },
  avatar: { ...BOXCAR_AVATAR_MOUNT },
  focusHeight: BOXCAR_FOCUS_HEIGHT,
}

export const BOXCAR_HUBS: CarPackHubs = {
  hubY: BOXCAR_HUB_Y,
  wheelbase: BOXCAR_WHEELBASE,
  trackFront: BOXCAR_TRACK_FRONT,
  trackRear: BOXCAR_TRACK_REAR,
  visualTravel: 0.15,
}

export const BOXCAR_ASSETS: CarPackAssets = {
  body: { url: '' },
  wheel: { url: '' },
}

export function boxcarWheelPositions(): CarPackWheelPositions {
  const halfWb = BOXCAR_WHEELBASE / 2
  const halfTrackF = BOXCAR_TRACK_FRONT / 2
  const halfTrackR = BOXCAR_TRACK_REAR / 2
  return {
    FL: { x: halfTrackF, y: BOXCAR_HUB_Y, z: halfWb },
    FR: { x: -halfTrackF, y: BOXCAR_HUB_Y, z: halfWb },
    RL: { x: halfTrackR, y: BOXCAR_HUB_Y, z: -halfWb },
    RR: { x: -halfTrackR, y: BOXCAR_HUB_Y, z: -halfWb },
  }
}

export const BOXCAR_PACK: CarPack = {
  id: BOXCAR_ID,
  entityPrefix: BOXCAR_ENTITY_PREFIX,
  mounts: BOXCAR_MOUNTS,
  hubs: BOXCAR_HUBS,
  assets: BOXCAR_ASSETS,
  wheelPositions: boxcarWheelPositions,
}

export const BOXCAR_SPEC: VehicleSpec = {
  ...FACTORY_VEHICLE_SPEC,
  mass: 1200,
  sizeX: BOXCAR_SIZE.x,
  sizeY: BOXCAR_SIZE.y,
  sizeZ: BOXCAR_SIZE.z,
  wheelbase: BOXCAR_WHEELBASE,
  radius: BOXCAR_WHEEL_RADIUS,
  cabinX: BOXCAR_EYE_1P.x,
  cabinY: BOXCAR_EYE_1P.y,
  cabinZ: BOXCAR_EYE_1P.z,
  rideY: 0.12,
  comY: 0.45,
  maxForce: 2800,
  reverseForce: 1800,
  headingDeg: 0,
}

export function matchesBoxcarPack(entityId: string): boolean {
  return entityId.startsWith(BOXCAR_ENTITY_PREFIX) || entityId === 'world.car.boxcar'
}

export default BOXCAR_PACK
