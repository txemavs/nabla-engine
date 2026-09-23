import { mapCache, type MapCache } from './map-cache.js'
import { revalidateBaked } from './baked-world.js'
import * as Lerc from 'lerc'
import lercWasm from 'lerc/lerc-wasm.wasm?url'
import { createRealWorld, type MapFeature, type WorldExtract } from '../src/real-world.js'
import { tileCoordinate, EARTH_RADIUS, type GeoPoint } from '../src/geography.js'
import type { Entity } from '../src/scene.js'
import { assembleMultipolygonRings } from '../src/multipolygon.js'

const CACHE_BASE = import.meta.env.VITE_WORLD_CACHE_URL || ''
const BAKED_BASE = import.meta.env.VITE_WORLD_BAKED_URL || CACHE_BASE
const ESRI = CACHE_BASE
  ? `${CACHE_BASE}/elevation`
  : 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile'
const OVERPASS = CACHE_BASE
  ? `${CACHE_BASE}/osm`
  : import.meta.env.VITE_WORLD_OVERPASS_URL || 'https://overpass-api.de/api/interpreter'
let nextRemoteRequest = 0
const CACHE = 'nabla-world-v3'
const decoded = new Map<string, Promise<Lerc.LercData>>()
let ready: Promise<void> | undefined
async function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}
export async function fetchChecked(
  url: string,
  signal: AbortSignal,
  init: RequestInit = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(CACHE_BASE && init.method === 'POST' ? 120000 : 40000),
      ]),
    })
    if (response.ok) return response
    if (init.method === 'POST') nextRemoteRequest = Date.now() + 60000
    if (attempt === 0 && init.method === 'POST' && [429, 502, 503, 504].includes(response.status)) {
      // One bounded retry lets a cold destination recover from temporary upstream
      // errors. Public Overpass keeps its existing one-minute failure cooldown.
      const seconds = Number(response.headers.get('retry-after'))
      const delay = Math.max(
        CACHE_BASE ? 10000 : 60000,
        Number.isFinite(seconds) ? seconds * 1000 : 0,
      )
      await response.body?.cancel()
      await waitForRetry(Math.min(60000, delay), signal)
      continue
    }
    throw new Error(`Proveedor HTTP ${response.status}`)
  }
}
/** Same global sample lattice as the bundled terrain, including identical shared edges. */
export function sampleGeo(origin: GeoPoint, x: number, z: number): GeoPoint {
  return {
    latitude: origin.latitude - ((z / EARTH_RADIUS) * 180) / Math.PI,
    longitude:
      origin.longitude +
      ((x / (EARTH_RADIUS * Math.cos((origin.latitude * Math.PI) / 180))) * 180) / Math.PI,
    altitude: origin.altitude,
  }
}
interface OsmElement {
  type: string
  id: number
  tags?: Record<string, string>
  lat?: number
  lon?: number
  geometry?: { lat: number; lon: number }[]
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[]
}
/**
 * Convert Overpass elements to MapFeatures.
 * Handles multipolygon assembly for relations where member ways need to be joined.
 */
export function overpassFeatures(elements: OsmElement[]): MapFeature[] {
  const result: MapFeature[] = [],
    members = new Set<number>()
  const coordinates = (g: { lat: number; lon: number }[]) =>
    g.map((p) => [p.lon, p.lat] as [number, number])
  const closed = (g: { lat: number; lon: number }[]) =>
    g.length >= 4 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon

  for (const e of elements) {
    if (e.type === 'relation' && e.members?.length) {
      const ways = e.members.filter(
        (m) => m.type === 'way' && (!m.role || m.role === 'outer' || m.role === 'inner'),
      )
      if (!ways.length) continue

      const allClosed = ways.every((m) => m.geometry && closed(m.geometry))
      if (allClosed) {
        result.push({
          id: `relation/${e.id}`,
          tags: e.tags ?? {},
          rings: ways.map((m) => ({
            role: m.role || 'outer',
            coordinates: coordinates(m.geometry!),
          })),
        })
        ways.forEach((m) => members.add(m.ref))
      } else {
        const wayGeoms = ways
          .filter((m) => m.geometry && m.geometry.length >= 2)
          .map((m) => ({
            role: m.role || 'outer',
            ref: m.ref,
            geometry: m.geometry!,
          }))

        if (!wayGeoms.length) continue

        const assembled = assembleMultipolygonRings(wayGeoms)
        const joinedPoints = new Set(
          assembled.rings.flatMap((r) => r.coordinates.map((p) => p.join(','))),
        )
        const used = ways.filter(
          (m) =>
            m.geometry?.length &&
            m.geometry.every((p) => joinedPoints.has([p.lon, p.lat].join(','))),
        )
        // Never fill a missing courtyard, or turn a partial building into a new footprint.
        if (
          ways.some((m) => m.role === 'inner' && !used.includes(m)) ||
          ((e.tags?.building || e.tags?.['building:part']) && used.length !== ways.length)
        )
          continue
        if (assembled.rings.length > 0) {
          result.push({
            id: `relation/${e.id}`,
            tags: e.tags ?? {},
            rings: assembled.rings.map((r) => ({
              role: r.role,
              coordinates: r.coordinates,
            })),
          })
          used.forEach((m) => members.add(m.ref))
        }
      }
    }
  }

  for (const e of elements) {
    if (e.type === 'way' && e.geometry?.length && !members.has(e.id)) {
      if ((e.tags?.building || e.tags?.['building:part']) && !closed(e.geometry)) continue
      result.push({
        id: `way/${e.id}`,
        tags: e.tags ?? {},
        rings: [{ role: 'outer', coordinates: coordinates(e.geometry) }],
      })
    } else if (
      e.type === 'node' &&
      (e.tags?.natural === 'tree' || !!e.tags?.place) &&
      e.lat !== undefined &&
      e.lon !== undefined
    )
      result.push({
        id: `node/${e.id}`,
        tags: e.tags!,
        rings: [{ role: 'point', coordinates: [[e.lon, e.lat]] }],
      })
  }
  return result
}
async function elevation(
  origin: GeoPoint,
  ox: number,
  oz: number,
  signal: AbortSignal,
  spacing = 10,
) {
  ready ??= Lerc.load({ locateFile: () => lercWasm })
  await ready
  const samples = Array.from({ length: 121 * 121 }, (_, i) => {
    const p = sampleGeo(
      origin,
      ox + (i % 121) * spacing - 60 * spacing,
      oz + Math.floor(i / 121) * spacing - 60 * spacing,
    )
    return tileCoordinate(p.latitude, p.longitude, 12)
  })
  const rasters = new Map<string, Lerc.LercData>()
  for (const p of samples) {
    const x = Math.floor(p.x),
      y = Math.floor(p.y),
      key = `${x}/${y}`
    if (rasters.has(key)) continue
    if (!decoded.has(key))
      decoded.set(
        key,
        fetchChecked(`${ESRI}/12/${y}/${x}`, signal)
          .then((r) => r.arrayBuffer())
          .then((b) => Lerc.decode(b))
          .catch((e) => {
            decoded.delete(key)
            throw e
          }),
      )
    rasters.set(key, await decoded.get(key)!)
  }
  while (decoded.size > 16) decoded.delete(decoded.keys().next().value!)
  return samples.map((p) => {
    const d = rasters.get(`${Math.floor(p.x)}/${Math.floor(p.y)}`)!,
      u = (p.x % 1) * (d.width - 1),
      v = (p.y % 1) * (d.height - 1)
    const x = Math.floor(u),
      y = Math.floor(v),
      fx = u - x,
      fz = v - y
    const pixel = (dx: number, dz: number) => {
      const index = Math.min(d.height - 1, y + dz) * d.width + Math.min(d.width - 1, x + dx),
        n = d.pixels[0][index]
      if ((d.mask && !d.mask[index]) || !Number.isFinite(n) || n === d.noDataValues?.[0])
        throw new Error('Relieve incompleto')
      return n
    }
    return (
      Math.round(
        ((1 - fx) * (1 - fz) * pixel(0, 0) +
          fx * (1 - fz) * pixel(1, 0) +
          (1 - fx) * fz * pixel(0, 1) +
          fx * fz * pixel(1, 1) -
          origin.altitude) *
          1000,
      ) / 1000
    )
  })
}
export async function loadWorldTile(
  origin: GeoPoint,
  key: string,
  signal: AbortSignal,
  destination = false,
): Promise<Entity[]> {
  const [x, z] = key.split('_').map(Number),
    ox = x * 1200,
    oz = z * 1200
  const cacheKey = new URL(
    `/__world-cache/${origin.latitude}/${origin.longitude}/${origin.altitude}/${key}`,
    location.origin,
  ).href
  let cache: MapCache | undefined, extract: WorldExtract | undefined
  let bakedEtag: string | undefined,
    changed = false
  try {
    cache = mapCache(CACHE)
    const hit = await cache.match(cacheKey)
    if (hit && Date.now() - Number(hit.headers.get('x-cached-at')) < 30 * 86400000) {
      extract = (await hit.json()) as WorldExtract
      bakedEtag = hit.headers.get('x-baked-etag') ?? undefined
    }
  } catch {
    /* Storage is optional; exploration still works in private browsers. */
  }
  if (BAKED_BASE) {
    const result = await revalidateBaked(CACHE_BASE, origin, key, signal, extract, bakedEtag, () =>
      elevation(origin, ox, oz, signal),
    )
    extract = result.extract
    bakedEtag = result.etag
    changed = result.changed
  }
  if (!extract) {
    const nw = sampleGeo(origin, ox - 750, oz - 750),
      se = sampleGeo(origin, ox + 750, oz + 750)
    const box = `${se.latitude},${nw.longitude},${nw.latitude},${se.longitude}`
    const query = `[out:json][timeout:25];(way[building](${box});way["building:part"](${box});way[highway](${box});relation[building](${box});node[natural=tree](${box});node[place~"^(city|town|village)$"][name](${box});way[railway~"^(rail|light_rail|tram|narrow_gauge)$"](${box});way[landuse](${box});way[leisure](${box});way["natural"~"water|wood|beach|sand|scrub|heath|wetland|marsh|grassland"](${box});way[water](${box});way[waterway~"riverbank|dock|river|stream"](${box});relation[landuse](${box});relation[leisure](${box});relation["natural"~"water|wood"](${box});relation[water](${box});relation[waterway~"riverbank"](${box}););out geom;`
    // Cached visits are immediate; public OSM requests are deliberately paced.
    const delay = Math.max(0, nextRemoteRequest - Date.now())
    if (delay)
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer)
          reject(new DOMException('Aborted', 'AbortError'))
        }
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort)
          resolve()
        }, delay)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    nextRemoteRequest = Date.now() + (CACHE_BASE ? 0 : 30000)
    const response = await fetchChecked(OVERPASS, signal, {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
    })
    const json = (await response.json()) as { elements: OsmElement[]; remark?: string }
    if (json.remark || !Array.isArray(json.elements)) throw new Error('Consulta OSM incompleta')
    const heights = await elevation(origin, ox, oz, signal)
    changed = true
    extract = {
      name: 'Irún · exploración',
      origin,
      terrain: { columns: 121, rows: 121, spacing: 10, heights },
      features: overpassFeatures(json.elements),
      source: { retrievedAt: new Date().toISOString(), osm: OVERPASS, elevation: ESRI },
    }
  }
  if (cache && extract && changed)
    try {
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(extract), {
          headers: {
            'content-type': 'application/json',
            'x-cached-at': String(Date.now()),
            ...(bakedEtag ? { 'x-baked-etag': bakedEtag } : {}),
          },
        }),
      )
    } catch {
      /* Quota failure must not discard usable terrain. */
    }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const doc = createRealWorld(extract, destination ? {} : { offset: [ox, oz], tileId: key })
  if (destination) return doc.entities
  return doc.entities.filter((e) => e.kind !== 'spawn' && e.kind !== 'vehicle')
}

export async function loadDistantTerrain(
  origin: GeoPoint,
  x: number,
  z: number,
  signal: AbortSignal,
) {
  return {
    columns: 121,
    rows: 121,
    spacing: 100,
    heights: await elevation(origin, x, z, signal, 100),
  }
}
