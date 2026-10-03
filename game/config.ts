/**
 * Game configuration from URL parameters and defaults.
 *
 * URL parameters:
 *   - lat: spawn latitude (default: Zaisa, Irun center)
 *   - lon: spawn longitude
 *   - alt: spawn altitude in meters
 *   - vehicle: vehicle preset ID (default: 'car')
 *   - tiles: tile base URL, WITHOUT the trailing /z (default: https://atlas.chained.world/euskadi);
 *            manifests are read from {tiles}/z/15/{x}/{y}/manifest.json
 *   - static: use static tile mode ('true' or '1')
 *   - distance: view distance in meters (1000-20000)
 *   - concurrency: tile download concurrency (1-3)
 *   - ahead: prefetch lookahead in seconds (0-45)
 */

import { DEFAULT_TILES_BASE_URL, normalizeTilesBase } from '../src/render/planet/static-tiles.js'

export interface GameConfig {
  spawn: {
    latitude: number
    longitude: number
    altitude: number
  }
  vehicle: string
  tilesBaseUrl: string
  staticTiles: boolean
  viewDistance: number
  tileConcurrency: number
  prefetchAhead: number
}

const ZAISA_IRUN = {
  latitude: 43.3372,
  longitude: -1.7523,
  altitude: 50,
} as const

export function parseGameConfig(search: string = location.search): GameConfig {
  const params = new URLSearchParams(search)

  const latitude = parseFloat(params.get('lat') ?? '') || ZAISA_IRUN.latitude
  const longitude = parseFloat(params.get('lon') ?? '') || ZAISA_IRUN.longitude
  const altitude = parseFloat(params.get('alt') ?? '') || ZAISA_IRUN.altitude

  const clampedLat = Math.max(-85, Math.min(85, latitude))
  const clampedLon = ((((longitude + 180) % 360) + 360) % 360) - 180

  const vehicle = params.get('vehicle') ?? 'car'

  // `?tiles=/` means "this origin" (manifests at /z/15/x/y/manifest.json); a missing or blank value means the default host.
  const tilesParam = params.get('tiles')
  const tilesBaseUrl =
    tilesParam === null || tilesParam.trim() === ''
      ? DEFAULT_TILES_BASE_URL
      : normalizeTilesBase(tilesParam)

  const staticParam = params.get('static')
  const staticTiles = staticParam !== 'false' && staticParam !== '0'

  const distanceParam = params.get('distance')
  const parsedDistance = distanceParam ? parseInt(distanceParam, 10) : NaN
  const viewDistance = Number.isFinite(parsedDistance)
    ? Math.max(1000, Math.min(20000, parsedDistance))
    : 4000

  const concurrencyParam = params.get('concurrency')
  const parsedConcurrency = concurrencyParam ? parseInt(concurrencyParam, 10) : NaN
  const tileConcurrency = Number.isFinite(parsedConcurrency)
    ? Math.max(1, Math.min(3, parsedConcurrency))
    : 2

  const aheadParam = params.get('ahead')
  const parsedAhead = aheadParam ? parseInt(aheadParam, 10) : NaN
  const prefetchAhead = Number.isFinite(parsedAhead) ? Math.max(0, Math.min(45, parsedAhead)) : 30

  return {
    spawn: {
      latitude: clampedLat,
      longitude: clampedLon,
      altitude,
    },
    vehicle,
    tilesBaseUrl,
    staticTiles,
    viewDistance,
    tileConcurrency,
    prefetchAhead,
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
  if (config.viewDistance !== 4000) {
    params.set('distance', String(config.viewDistance))
  }
  if (config.tileConcurrency !== 2) {
    params.set('concurrency', String(config.tileConcurrency))
  }
  if (config.prefetchAhead !== 30) {
    params.set('ahead', String(config.prefetchAhead))
  }
  return '?' + params.toString()
}
