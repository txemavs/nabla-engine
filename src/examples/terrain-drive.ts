import { createEntity, type Entity, type Vec3Tuple } from '../entity/schema.js'
import { localToGeo, type GeoPoint } from '../math/geo/sphere.js'
import { mapTileSample, type MapTile } from '../scene/mercator.js'
import type { SceneDocument } from '../scene/document.js'
import { presetEntities, presetVehicle } from '../catalog/vehicles/index.js'

/** Same parked fleet and play rules as the flat example, but on whatever terrain a tile host serves. */
export interface TerrainDriveOptions {
  /** Where the player's vehicle starts; also the origin of the local metre frame. */
  latitude: number
  longitude: number
  /** Origin altitude in metres. Default 0: the terrain GLBs carry absolute elevations. */
  altitude?: number
  /** Direction the vehicles face, degrees clockwise from north. Default 0. */
  heading?: number
  /** Preset the player starts in. Default `car`. */
  vehicle?: string
  /** `live` (default, browser local wall clock), `day` (fixed local-noon sun) or an ISO date-time. */
  sky?: string
  /**
   * Parked demo row (car, a3, white-truck, carrier). Default true.
   * Host `?vehicles=` sets this false so the demo row does not stack on the host fleet.
   */
  includeDemoFleet?: boolean
}

export const TERRAIN_DRIVE_DAY = '2026-06-21T10:30:00.000Z'
/** Distance between the tractor hitch and the trailer origin (metres), as in the flat example. */
const TRAILER_OFFSET = 7.33
/** Parked vehicles in a row along the heading, in metres ahead of the player (negative = behind). */
const PARKED = [
  { preset: 'car', ahead: -22 },
  { preset: 'a3', ahead: 9 },
  { preset: 'white-truck', ahead: 26 },
  { preset: 'carrier', ahead: 46 },
] as const

/** `16211/12003` or `16211,12003` -> a z15 tile. */
export function parseTileSpec(spec: string): MapTile {
  const match = /^\s*(\d{1,6})\s*[/,]\s*(\d{1,6})\s*$/.exec(spec)
  if (!match) throw new Error(`Invalid tile "${spec}": use <x>/<y>, e.g. 16211/12003`)
  const tile = { z: 15, x: Number(match[1]), y: Number(match[2]) }
  mapTileSample(tile, 1, 1, 2) // throws for tiles outside the quadtree
  return tile
}

/** Geographic point `east` metres east and `south` metres south of a tile's centre. */
export function tileOffsetToGeo(tile: MapTile, east = 0, south = 0): GeoPoint {
  return localToGeo(mapTileSample(tile, 1, 1, 2), [east, 0, south])
}

function skyFor(value: string | undefined): NonNullable<SceneDocument['sky']> {
  if (!value || value === 'live') return { mode: 'live' }
  if (value === 'day') return { mode: 'fixed', at: TERRAIN_DRIVE_DAY }
  if (Number.isNaN(Date.parse(value)) || !/[zZ]|[+-]\d\d:?\d\d$/.test(value))
    throw new Error(`Invalid sky "${value}": use day, live or an ISO date-time with zone`)
  return { mode: 'fixed', at: new Date(value).toISOString() }
}

/**
 * Player vehicle at the origin plus, unless `includeDemoFleet` is false, the car, white truck
 * with trailer and flying container parked ahead, all facing `heading`. Heights are authored
 * as 0: run with `restParkedOnGround`.
 */
export function createTerrainDriveScene(options: TerrainDriveOptions): SceneDocument {
  const player = options.vehicle ?? 'car'
  const bearing = ((options.heading ?? 0) * Math.PI) / 180
  const forward: Vec3Tuple = [Math.sin(bearing), 0, -Math.cos(bearing)]
  const right: Vec3Tuple = [Math.cos(bearing), 0, Math.sin(bearing)]
  // Vehicles face -Z; a yaw of -bearing about +Y turns them to the requested compass heading.
  const rotation: [number, number, number, number] = [
    0,
    Math.sin(-bearing / 2),
    0,
    Math.cos(-bearing / 2),
  ]
  const at = (ahead: number, side = 0): Vec3Tuple => [
    forward[0] * ahead + right[0] * side,
    0,
    forward[2] * ahead + right[2] * side,
  ]
  const place = (entities: Entity[], ahead: number) => {
    const root = entities[0]
    const [x, , z] = at(ahead)
    root.transform.position = [x, 0, z]
    root.transform.rotation = [...rotation]
    return entities
  }
  const parked = (preset: string, ahead: number) =>
    place(presetEntities(preset, preset === player ? 'player-vehicle' : `demo-${preset}`), ahead)
  const entities: Entity[] = [createEntity('spawn', 'spawn', at(0, -4))]
  const tow = (tractor: Entity, ahead: number) => {
    const trailer = place(
      [presetVehicle('white-trailer', `${tractor.id}-trailer`)],
      ahead - TRAILER_OFFSET,
    )[0]
    tractor.groundOffset = 1.45
    trailer.vehicle!.tow = {
      vehicleId: tractor.id,
      hitch: tractor.vehicle!.hitch!,
      anchor: trailer.vehicle!.towAnchor!,
    }
    return trailer
  }
  const playerEntities = parked(player, 0)
  entities.push(...playerEntities)
  if (player === 'white-truck') entities.push(tow(playerEntities[0], 0))
  if (options.includeDemoFleet !== false) {
    for (const slot of PARKED) {
      if (slot.preset === player) continue
      const group = parked(slot.preset, slot.ahead)
      entities.push(...group)
      if (slot.preset === 'white-truck') entities.push(tow(group[0], slot.ahead))
    }
  }
  return {
    version: 1,
    name: 'Terreno Z15 · conducción',
    geography: {
      latitude: options.latitude,
      longitude: options.longitude,
      altitude: options.altitude ?? 0,
      imagery: 'offline',
      planetary: true,
    },
    sky: skyFor(options.sky),
    entities,
  }
}
