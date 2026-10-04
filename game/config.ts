/**
 * Game configuration from URL parameters and defaults.
 *
 * URL parameters:
 *   - lat: spawn latitude (default: Zaisa, Irun center)
 *   - lon: spawn longitude
 *   - vehicle: vehicle preset ID (default: 'car')
 *   - tiles: explicit tile base URL, WITHOUT the trailing /z (required for geographic static mode);
 *            manifests are read from {tiles}/z/15/{x}/{y}/manifest.json
 *   - static: use static tile mode ('true' or '1')
 */

import { normalizeTilesBase } from '@nabla/engine/planet/static-tiles'

export interface GameConfig {
  spawn: {
    latitude: number
    longitude: number
    altitude: number
  }
  vehicle: string
  /** Undefined means unconfigured; empty string explicitly selects this origin. */
  tilesBaseUrl: string | undefined
  staticTiles: boolean
}

const ZAISA_IRUN = {
  latitude: 43.3372,
  longitude: -1.7523,
  altitude: 50,
} as const

export function parseGameConfig(search: string = location.search): GameConfig {
  const params = new URLSearchParams(search)

  const coordinate = (key: string, fallback: number) => {
    const value = parseFloat(params.get(key) ?? '')
    return Number.isFinite(value) ? value : fallback
  }
  const latitude = coordinate('lat', ZAISA_IRUN.latitude)
  const longitude = coordinate('lon', ZAISA_IRUN.longitude)
  const altitude = coordinate('alt', ZAISA_IRUN.altitude)

  const clampedLat = Math.max(-85, Math.min(85, latitude))
  const clampedLon = ((((longitude + 180) % 360) + 360) % 360) - 180

  const vehicle = params.get('vehicle') ?? 'car'

  // Preserve the distinction between an explicit origin root and missing configuration.
  const tilesParam = params.get('tiles')
  const tilesBaseUrl =
    tilesParam === null || tilesParam.trim() === '' ? undefined : normalizeTilesBase(tilesParam)

  const staticParam = params.get('static')
  const staticTiles = staticParam !== 'false' && staticParam !== '0'

  return {
    spawn: {
      latitude: clampedLat,
      longitude: clampedLon,
      altitude,
    },
    vehicle,
    tilesBaseUrl,
    staticTiles,
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
  if (config.tilesBaseUrl !== undefined) {
    params.set('tiles', config.tilesBaseUrl || '/')
  }
  if (!config.staticTiles) {
    params.set('static', 'false')
  }
  return '?' + params.toString()
}

/** Validate geographic terrain before allocating a renderer or starting any requests. */
export function requireGeographicTileBase(config: GameConfig): string {
  // Dynamic mode explicitly selects the demo's same-origin preparation service.
  if (!config.staticTiles) return '/prepared'
  if (config.tilesBaseUrl === undefined)
    throw new Error(
      'Terrain source missing: set ?tiles=<tile-base-url> for geographic mode, or use ?example=flat for the local planetary demo.',
    )
  return config.tilesBaseUrl
}
