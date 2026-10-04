/**
 * Game configuration from URL parameters and defaults.
 *
 * URL parameters:
 *   - lat: spawn latitude (default: Zaisa, Irun center)
 *   - lon: spawn longitude
 *   - vehicle: vehicle preset ID (default: 'car')
 *   - tiles: tile base URL, WITHOUT the trailing /z (default: https://atlas.chained.world/euskadi);
 *            manifests are read from {tiles}/z/15/{x}/{y}/manifest.json
 *   - static: use static tile mode ('true' or '1')
 *   - tile: single tile mode - load ONLY this tile (format: z/x/y e.g. 15/16224/11998)
 *           truck spawns at tile center on real terrain
 */

import { DEFAULT_TILES_BASE_URL, normalizeTilesBase } from '../src/render/planet/static-tiles.js'
import { tileCenterGeo, type MapTile } from '../src/scene/mercator.js'

export interface GameConfig {
  spawn: {
    latitude: number
    longitude: number
    altitude: number
  }
  vehicle: string
  tilesBaseUrl: string
  staticTiles: boolean
  /** Single tile mode: load only this specific tile, truck at center */
  singleTile: MapTile | null
}

/**
 * Default spawn at Zaisa industrial area, Irún.
 * This position is on land (west of the Bidasoa river) on a road.
 * Previous spawn at lon -1.7523 was in the river channel with no ground triangles.
 */
const ZAISA_IRUN = {
  latitude: 43.3365,
  longitude: -1.7565,
  altitude: 50,
} as const

/**
 * Parse single tile parameter (format: z/x/y e.g. 15/16224/11998)
 */
function parseSingleTile(tileParam: string | null): MapTile | null {
  if (!tileParam) return null
  const parts = tileParam.split('/')
  if (parts.length !== 3) return null
  const z = parseInt(parts[0], 10)
  const x = parseInt(parts[1], 10)
  const y = parseInt(parts[2], 10)
  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) return null
  if (z < 0 || z > 20 || x < 0 || y < 0) return null
  return { z, x, y }
}

export function parseGameConfig(search: string = location.search): GameConfig {
  const params = new URLSearchParams(search)

  const vehicle = params.get('vehicle') ?? 'car'

  // `?tiles=/` means "this origin" (manifests at /z/15/x/y/manifest.json); a missing or blank value means the default host.
  const tilesParam = params.get('tiles')
  const tilesBaseUrl =
    tilesParam === null || tilesParam.trim() === ''
      ? DEFAULT_TILES_BASE_URL
      : normalizeTilesBase(tilesParam)

  const staticParam = params.get('static')
  const staticTiles = staticParam !== 'false' && staticParam !== '0'

  // Single tile mode: load only one specific tile, truck at center
  const singleTile = parseSingleTile(params.get('tile'))

  // If single tile mode, spawn at tile center; otherwise use lat/lon params
  let latitude: number
  let longitude: number
  let altitude: number

  if (singleTile) {
    const tileCenter = tileCenterGeo(singleTile)
    latitude = tileCenter.latitude
    longitude = tileCenter.longitude
    altitude = 50 // Default altitude, will be overridden by terrain
  } else {
    latitude = parseFloat(params.get('lat') ?? '') || ZAISA_IRUN.latitude
    longitude = parseFloat(params.get('lon') ?? '') || ZAISA_IRUN.longitude
    altitude = parseFloat(params.get('alt') ?? '') || ZAISA_IRUN.altitude
  }

  const clampedLat = Math.max(-85, Math.min(85, latitude))
  const clampedLon = ((((longitude + 180) % 360) + 360) % 360) - 180

  return {
    spawn: {
      latitude: clampedLat,
      longitude: clampedLon,
      altitude,
    },
    vehicle,
    tilesBaseUrl,
    staticTiles,
    singleTile,
  }
}

export function configToUrl(config: GameConfig): string {
  const params = new URLSearchParams()
  params.set('lat', config.spawn.latitude.toFixed(6))
  params.set('lon', config.spawn.longitude.toFixed(6))
  if (config.spawn.altitude !== ZAISA_IRUN.altitude) {
    params.set('alt', config.spawn.altitude.toFixed(1))
  }
  if (config.vehicle !== 'car') {
    params.set('vehicle', config.vehicle)
  }
  if (config.tilesBaseUrl !== DEFAULT_TILES_BASE_URL) {
    params.set('tiles', config.tilesBaseUrl || '/')
  }
  if (!config.staticTiles) {
    params.set('static', 'false')
  }
  return '?' + params.toString()
}
