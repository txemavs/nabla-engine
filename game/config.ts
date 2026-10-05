/**
 * Game configuration from URL parameters and defaults.
 *
 * URL parameters:
 *   - lat: spawn latitude (default: Zaisa, Irun center)
 *   - lon: spawn longitude
 *   - alt: origin altitude in metres (default 50)
 *   - heading: player compass heading, degrees clockwise from north (default 0)
 *   - vehicle: vehicle preset ID (default: 'car') — the possessed start vehicle
 *   - color: body paint for the start vehicle (`#rrggbb`, same `entity.color` as cars)
 *   - vehicles: JSON array of extra host vehicles `{lat, lon, heading, vehicle, alt?, color?, tow?, box?}`
 *     (WGS84). Also `VITE_NABLA_VEHICLES` at build time. See `host-vehicles.ts`.
 *   - tiles: explicit tile base URL, WITHOUT the trailing /z (required for geographic static mode);
 *            manifests are read from {tiles}/z/15/{x}/{y}/manifest.json
 *   - static: use static tile mode ('true' or '1')
 */

import { normalizeTilesBase } from '@nabla/engine/planet/static-tiles'
import { hostVehiclesFromSearch, viteHostVehicles, type HostVehicle } from './host-vehicles.js'

export interface GameConfig {
  spawn: {
    latitude: number
    longitude: number
    altitude: number
    heading: number
  }
  vehicle: string
  /** Optional `#rrggbb` paint for the start vehicle. Same field cars already use. */
  color?: string
  /** Extra vehicles placed after terrain is ready. Empty when none were declared. */
  vehicles: HostVehicle[]
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
  const heading = coordinate('heading', 0)

  const clampedLat = Math.max(-85, Math.min(85, latitude))
  const clampedLon = ((((longitude + 180) % 360) + 360) % 360) - 180

  const vehicle = params.get('vehicle') ?? 'car'
  const colorParam = params.get('color')
  const color = colorParam && /^#[0-9a-fA-F]{6}$/.test(colorParam) ? colorParam : undefined

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
      heading,
    },
    vehicle,
    ...(color ? { color } : {}),
    vehicles: hostVehiclesFromSearch(search, viteHostVehicles()),
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
  if (config.spawn.heading) {
    params.set('heading', String(config.spawn.heading))
  }
  if (config.vehicle !== 'car') {
    params.set('vehicle', config.vehicle)
  }
  if (config.color) {
    params.set('color', config.color)
  }
  if (config.vehicles.length) {
    params.set('vehicles', JSON.stringify(config.vehicles))
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
