/**
 * Ship 5×10 pack — hovercraft container with garage ramp.
 *
 * Ported from Agency uploads/ship5x10/index.ts.
 * 20 000 kg / 1000 CV hovercraft. No wheels (hover flight), has a garage
 * with a ramp that a car can drive into when the ship is parked.
 *
 * Body frame: metres, Y-up. Origin at geometric center.
 * +X right, +Y up, +Z forward (proa is -Z, popa is +Z).
 *
 * Garage is at the stern (+Z), opening facing popa direction.
 * When ship yaw=0, the ramp faces +Z.
 *
 * headingDeg: 180 — GLB proa is −Z, so controls are flipped.
 */
import type { CarPackMounts } from '../../vehicle/carPack.js'
import type { StaticBox } from '../../vehicle/obstacleKit.js'
import type { VehicleSpec } from '../../vehicle/vehicleSpec.js'
import { CONTAINER_SPEC } from '../../vehicle/vehicleSpec.js'

export interface ShipPackGarage {
  ramp: StaticBox
  floor: StaticBox
  openingWidth: number
  openingHeight: number
}

export interface ShipPack {
  id: string
  entityPrefix: string
  mounts: CarPackMounts
  mass: number
  powerNote: string
  garage: ShipPackGarage
  size: { x: number; y: number; z: number }
  assets: { body: { url: string } }
}

export const SHIP_ENTITY_PREFIX = 'world.ship.container.5x10.'
export const SHIP_ID = 'ship5x10'

export const SHIP_SIZE = {
  x: 5,
  y: 3.2,
  z: 10,
} as const

export const SHIP_EYE_1P = { x: 0, y: 2.55, z: -2 } as const
export const SHIP_AVATAR_MOUNT = { x: 0, y: 2.55, z: -2 } as const
export const SHIP_FOCUS_HEIGHT = 1.55

export const SHIP_MOUNTS: CarPackMounts = {
  eye1p: { ...SHIP_EYE_1P },
  avatar: { ...SHIP_AVATAR_MOUNT },
  focusHeight: SHIP_FOCUS_HEIGHT,
}

const SHIP_HALF_LENGTH = 5
const SHIP_FLOOR_Y = 0.25
const RAMP_LENGTH = 3.5
const RAMP_ANGLE_DEG = 8
const RAMP_ANGLE_RAD = (RAMP_ANGLE_DEG * Math.PI) / 180
const RAMP_RISE = RAMP_LENGTH * Math.sin(RAMP_ANGLE_RAD)
const RAMP_RUN = RAMP_LENGTH * Math.cos(RAMP_ANGLE_RAD)
const RAMP_THICKNESS = 0.12
const FLOOR_DEPTH = 4
const FLOOR_WIDTH = 3.2
const FLOOR_THICKNESS = 0.15
const OPENING_WIDTH = 2.8
const OPENING_HEIGHT = 2.2

export const SHIP_GARAGE: ShipPackGarage = {
  ramp: {
    x: 0,
    y: SHIP_FLOOR_Y + RAMP_RISE / 2 + RAMP_THICKNESS / 2,
    z: SHIP_HALF_LENGTH + RAMP_RUN / 2,
    hx: FLOOR_WIDTH / 2,
    hy: RAMP_THICKNESS / 2,
    hz: RAMP_LENGTH / 2,
    pitch: -RAMP_ANGLE_RAD,
  },
  floor: {
    x: 0,
    y: SHIP_FLOOR_Y + RAMP_RISE + FLOOR_THICKNESS / 2,
    z: SHIP_HALF_LENGTH - FLOOR_DEPTH / 2 + 0.3,
    hx: FLOOR_WIDTH / 2,
    hy: FLOOR_THICKNESS / 2,
    hz: FLOOR_DEPTH / 2,
  },
  openingWidth: OPENING_WIDTH,
  openingHeight: OPENING_HEIGHT,
}

export const SHIP_ASSETS = {
  body: { url: '/world/ship.container.5x10.glb' },
}

export const SHIP_5X10_PACK: ShipPack = {
  id: SHIP_ID,
  entityPrefix: SHIP_ENTITY_PREFIX,
  mounts: SHIP_MOUNTS,
  mass: 20000,
  powerNote: '1000 CV hovercraft',
  garage: SHIP_GARAGE,
  size: SHIP_SIZE,
  assets: SHIP_ASSETS,
}

export function shipGarageBoxes(shipPose: {
  x: number
  y: number
  z: number
  yaw: number
}): StaticBox[] {
  const yawRad = (shipPose.yaw * Math.PI) / 180
  const c = Math.cos(yawRad)
  const s = Math.sin(yawRad)

  const transform = (box: StaticBox): StaticBox => {
    const localX = box.x
    const localZ = box.z
    const worldX = shipPose.x + localX * c + localZ * s
    const worldZ = shipPose.z - localX * s + localZ * c
    const worldY = shipPose.y + box.y

    return {
      x: worldX,
      y: worldY,
      z: worldZ,
      hx: box.hx,
      hy: box.hy,
      hz: box.hz,
      yaw: (box.yaw ?? 0) + yawRad,
      pitch: box.pitch,
    }
  }

  return [transform(SHIP_GARAGE.ramp), transform(SHIP_GARAGE.floor)]
}

export const SHIP_5X10_SPEC: VehicleSpec = {
  ...CONTAINER_SPEC,
}

export function matchesShipPack(entityId: string): boolean {
  return (
    entityId.startsWith(SHIP_ENTITY_PREFIX) ||
    entityId === 'world.ship.container.5x10' ||
    entityId === 'world.ship.home' ||
    entityId === 'world.home'
  )
}

export default SHIP_5X10_PACK
