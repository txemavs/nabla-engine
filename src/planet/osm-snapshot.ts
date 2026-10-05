/**
 * Offline Z15 OSM snapshot (`osm.snapshot` / `osm-*.json.gz`).
 * Format `nabla-ways-osm-cell/1`: Overpass answers for features, buildings, roads.
 * Pure data: no DOM, no network.
 */
import { geoToLocal, type GeoPoint } from '../math/geo/sphere.js'

export const OSM_CELL_FORMAT = 'nabla-ways-osm-cell/1'

const SKIP_HIGHWAYS = new Set([
  'construction',
  'proposed',
  'steps',
  'elevator',
  'corridor',
  'platform',
  'bus_stop',
  'rest_area',
  'services',
  'street_lamp',
  'traffic_signals',
  'crossing',
  'give_way',
  'stop',
  'milestone',
])
const FOOT_HIGHWAYS = new Set(['path', 'footway', 'pedestrian', 'cycleway', 'bridleway', 'track'])

export interface OsmHighway {
  id: string
  name: string
  highway: string
  width: number
  carriageway: boolean
  geometry: { lat: number; lon: number }[]
}

export interface OsmChartRoad {
  name: string
  points: { x: number; z: number }[]
  width: number
  carriageway: boolean
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

interface OverpassElement {
  type?: string
  id?: number | string
  tags?: Record<string, string>
  geometry?: { lat?: number; lon?: number }[]
}

function metric(value: string | undefined, fallback: number) {
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function overpassElements(value: unknown): OverpassElement[] {
  if (!value || typeof value !== 'object') return []
  const elements = (value as { elements?: unknown }).elements
  return Array.isArray(elements) ? (elements as OverpassElement[]) : []
}

function roadsBlock(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined
  const root = value as { format?: string; roads?: unknown; elements?: unknown }
  if (root.format && root.format !== OSM_CELL_FORMAT) return undefined
  return root.roads ?? (Array.isArray(root.elements) ? root : undefined)
}

/** Named and unnamed highways from a package OSM snapshot (or a raw Overpass roads answer). */
export function osmSnapshotHighways(value: unknown): OsmHighway[] {
  const out: OsmHighway[] = []
  for (const el of overpassElements(roadsBlock(value))) {
    const tags = el.tags
    const highway = tags?.highway
    if (!highway || SKIP_HIGHWAYS.has(highway) || el.type === 'node') continue
    const geometry = (el.geometry ?? []).filter(
      (p): p is { lat: number; lon: number } => Number.isFinite(p?.lat) && Number.isFinite(p?.lon),
    )
    if (geometry.length < 2) continue
    const foot = FOOT_HIGHWAYS.has(highway)
    const width = Math.min(
      25,
      Math.max(1, metric(tags.width, foot ? 2 : metric(tags.lanes, 2) * 3)),
    )
    const name = tags.name?.trim() ?? ''
    out.push({
      id: String(el.id ?? `${highway}-${out.length}`),
      name: name && name !== highway ? name : '',
      highway,
      width,
      carriageway: !foot,
      geometry,
    })
  }
  return out
}

/** Project snapshot highways into the scene metre frame (same origin as the vehicle pose). */
export function projectOsmRoads(highways: OsmHighway[], origin: GeoPoint): OsmChartRoad[] {
  return highways.map((road) => {
    const points = road.geometry.map((p) => {
      const [x, , z] = geoToLocal(origin, {
        latitude: p.lat,
        longitude: p.lon,
        altitude: origin.altitude,
      })
      return { x, z }
    })
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity
    for (const p of points) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    }
    return {
      name: road.name,
      points,
      width: road.width,
      carriageway: road.carriageway,
      minX,
      maxX,
      minZ,
      maxZ,
    }
  })
}
