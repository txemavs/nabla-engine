/**
 * Standalone portals the host places after terrain is ready, listed like host vehicles.
 *
 * Each entry is geographic (WGS84 lat/lon, heading clockwise from north = the direction you
 * walk through it, optional orthometric alt). The game converts it to local metres and installs
 * a Stargate mouth with `GameRuntime.placeEntities` — the same path as the in-game
 * «Añadir portal» entry. Entries that name another entry in `to` are linked once both stand,
 * in `mode` (default `open`). Unlinked portals stay closed; players link them from the panel on
 * the back of the frame, where every portal (standalone and carrier stern) is a destination.
 *
 * Sources, URL wins:
 *   - `?portals=<json>` — JSON array of {@link HostPortal}
 *   - `VITE_NABLA_PORTALS` — same JSON at build time (Vite define / env)
 *   - a typed `HostPortal[]` passed to {@link installHostPortals}
 *
 * Example (two linked portals 300 m apart):
 *   [{"name":"Plaza","lat":43.3381,"lon":-1.7667,"heading":60,"to":"Puerto"},
 *    {"name":"Puerto","lat":43.3392,"lon":-1.7631,"heading":240}]
 */
import { geoToLocal, type GeoPoint } from '@nabla/engine'
import { isValidLatLon } from '@nabla/engine/planet/lat-lon'
import { createPlaceablePortal } from '@nabla/engine/runtime'
import type { Entity, Vec3Tuple } from '@nabla/engine/scene'
import { headingYaw } from './host-vehicles.js'

/** One standalone portal, authored in geographic coordinates. */
export interface HostPortal {
  /** Shown in portal panels and the add-menu list; unique within the list. */
  name: string
  /** WGS84 latitude in degrees. */
  lat: number
  /** WGS84 longitude in degrees. */
  lon: number
  /** Compass heading you walk through it, degrees clockwise from north. Default 0. */
  heading: number
  /** Accepted for symmetry with host vehicles; the frame always stands on the loaded ground. */
  alt?: number
  /** Name of another entry to link to once both are placed. */
  to?: string
  /** Link mode when `to` is set: `open` (traversable, default) or `window` (view only). */
  mode?: 'open' | 'window'
}

/** What {@link installHostPortals} needs from the browser runtime. */
export interface HostPortalRuntime {
  placeEntities(
    entities: Entity[],
    position: Vec3Tuple,
    yaw?: number,
    timeoutMs?: number,
    name?: string,
  ): Promise<string>
  readonly placedObjects: { id: string; ids: string[] }[]
  configurePortal(
    id: string,
    destinationId: string | null,
    mode: 'closed' | 'window' | 'open',
  ): string
}

function finite(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
    return Number(value)
  throw new Error(`Host portal ${field} must be a finite number`)
}

/** Parse a JSON array of {@link HostPortal}. Throws on invalid JSON, entries or links. */
export function parseHostPortals(raw: string): HostPortal[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Host portals must be a JSON array of {name, lat, lon, heading}')
  }
  if (!Array.isArray(parsed))
    throw new Error('Host portals must be a JSON array of {name, lat, lon, heading}')
  const portals = parsed.map((value, index): HostPortal => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Host portal ${index} must be an object`)
    const entry = value as Record<string, unknown>
    if (typeof entry.name !== 'string' || !entry.name.trim())
      throw new Error(`Host portal ${index} needs a name`)
    const lat = finite(entry.lat, `${index}.lat`)
    const lon = finite(entry.lon, `${index}.lon`)
    if (!isValidLatLon({ latitude: lat, longitude: lon }))
      throw new Error(`Host portal ${index} lat/lon is out of range (lat ±85.05°, lon ±180°)`)
    const portal: HostPortal = {
      name: entry.name.trim(),
      lat,
      lon,
      heading: entry.heading === undefined ? 0 : finite(entry.heading, `${index}.heading`),
    }
    if (entry.alt !== undefined) portal.alt = finite(entry.alt, `${index}.alt`)
    if (entry.to !== undefined) {
      if (typeof entry.to !== 'string' || !entry.to.trim())
        throw new Error(`Host portal ${index}.to must be the name of another portal`)
      portal.to = entry.to.trim()
    }
    if (entry.mode !== undefined) {
      if (entry.mode !== 'open' && entry.mode !== 'window')
        throw new Error(`Host portal ${index}.mode must be open or window`)
      portal.mode = entry.mode
    }
    return portal
  })
  validateLinks(portals)
  return portals
}

function validateLinks(portals: readonly HostPortal[]): void {
  const names = new Set<string>()
  for (const portal of portals) {
    if (names.has(portal.name)) throw new Error(`Host portal name repeated: ${portal.name}`)
    names.add(portal.name)
  }
  const linked = new Set<string>()
  for (const portal of portals) {
    if (!portal.to) continue
    if (portal.to === portal.name || !names.has(portal.to))
      throw new Error(`Host portal ${portal.name} links to unknown portal ${portal.to}`)
    for (const name of [portal.name, portal.to]) {
      if (linked.has(name)) throw new Error(`Host portal ${name} is linked twice`)
      linked.add(name)
    }
  }
}

/** Build-time default from `VITE_NABLA_PORTALS` (same JSON as `?portals=`). */
export function viteHostPortals(): HostPortal[] {
  const raw = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_NABLA_PORTALS
  if (raw === undefined || raw.trim() === '') return []
  return parseHostPortals(raw)
}

/** Read `?portals=`; a missing param uses `fallback`, a present empty value is an empty list. */
export function hostPortalsFromSearch(
  search: string,
  fallback: readonly HostPortal[] = [],
): HostPortal[] {
  const raw = new URLSearchParams(search).get('portals')
  if (raw === null) return [...fallback]
  if (raw.trim() === '') return []
  return parseHostPortals(raw)
}

/**
 * After `runtime.play()`, place each portal on loaded ground and link the `to` pairs.
 * Returns the portal entity ids by name.
 */
export async function installHostPortals(
  runtime: HostPortalRuntime,
  origin: GeoPoint,
  portals: readonly HostPortal[],
): Promise<Map<string, string>> {
  validateLinks(portals)
  const ids = new Map<string, string>()
  for (const [index, portal] of portals.entries()) {
    const position = geoToLocal(origin, {
      latitude: portal.lat,
      longitude: portal.lon,
      altitude: portal.alt ?? origin.altitude,
    })
    const group = await runtime.placeEntities(
      [createPlaceablePortal(`host-portal-${index}`, portal.name)],
      position,
      headingYaw(portal.heading),
      undefined,
      portal.name,
    )
    const placed = runtime.placedObjects.find((entry) => entry.id === group)
    if (!placed?.ids[0]) throw new Error(`Host portal ${portal.name} was not placed`)
    ids.set(portal.name, placed.ids[0])
  }
  for (const portal of portals)
    if (portal.to)
      runtime.configurePortal(ids.get(portal.name)!, ids.get(portal.to)!, portal.mode ?? 'open')
  return ids
}
