/**
 * Game configuration from URL parameters and defaults.
 *
 * URL parameters:
 *   - lat: spawn latitude (default: Zaisa, Irun center)
 *   - lon: spawn longitude
 *   - vehicle: vehicle preset ID (default: 'car')
 *   - tiles: tile base URL (default: same origin /z/)
 *   - static: use static tile mode ('true' or '1')
 */

export interface GameConfig {
  spawn: {
    latitude: number
    longitude: number
    altitude: number
  }
  vehicle: string
  tilesBaseUrl: string
  staticTiles: boolean
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

  const tilesParam = params.get('tiles')
  const tilesBaseUrl = tilesParam ?? '/z'

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
  if (config.tilesBaseUrl !== '/z') {
    params.set('tiles', config.tilesBaseUrl)
  }
  if (!config.staticTiles) {
    params.set('static', 'false')
  }
  return '?' + params.toString()
}
