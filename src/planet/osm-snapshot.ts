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

/** Surfaces that are not paved: such an area keeps the grass grip and marks. */
const UNPAVED = new Set([
  'grass',
  'grass_paver',
  'gravel',
  'fine_gravel',
  'dirt',
  'earth',
  'ground',
  'mud',
  'sand',
  'unpaved',
  'compacted',
  'pebblestone',
  'wood',
])

/** A paved polygon (geographic) from the snapshot: car parks and paved road areas. */
export interface OsmPavedArea {
  id: string
  geometry: { lat: number; lon: number }[]
}

/**
 * Paved areas that are not carriageways: OSM car parks (`amenity=parking`, except underground,
 * multi-storey and rooftop ones) and `area:highway` / `area=yes` service and pedestrian areas,
 * as closed ways in the roads block. An unpaved `surface` (grass, gravel…) is left out.
 */
export function osmSnapshotPavedAreas(value: unknown): OsmPavedArea[] {
  const out: OsmPavedArea[] = []
  for (const el of overpassElements(roadsBlock(value))) {
    const tags = el.tags
    if (!tags || el.type === 'node') continue
    const parking =
      tags.amenity === 'parking' &&
      !['underground', 'multi-storey', 'rooftop'].includes(tags.parking ?? '')
    const roadArea =
      (tags['area:highway'] && tags['area:highway'] !== 'traffic_island') ||
      (tags.area === 'yes' &&
        ['service', 'pedestrian', 'living_street'].includes(tags.highway ?? ''))
    if (!parking && !roadArea) continue
    if (UNPAVED.has(tags.surface ?? '')) continue
    const geometry = (el.geometry ?? []).filter(
      (p): p is { lat: number; lon: number } => Number.isFinite(p?.lat) && Number.isFinite(p?.lon),
    )
    if (geometry.length < 4) continue
    out.push({ id: String(el.id ?? `area-${out.length}`), geometry })
  }
  return out
}

/** Project paved areas into the scene metre frame, with bounds. */
export function projectOsmPavedAreas(
  areas: OsmPavedArea[],
  origin: GeoPoint,
): {
  points: { x: number; z: number }[]
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}[] {
  return areas.map((area) => {
    const points = area.geometry.map((p) => {
      const [x, , z] = geoToLocal(origin, {
        latitude: p.lat,
        longitude: p.lon,
        altitude: origin.altitude,
      })
      return { x, z }
    })
    return {
      points,
      minX: Math.min(...points.map((p) => p.x)),
      maxX: Math.max(...points.map((p) => p.x)),
      minZ: Math.min(...points.map((p) => p.z)),
      maxZ: Math.max(...points.map((p) => p.z)),
    }
  })
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
