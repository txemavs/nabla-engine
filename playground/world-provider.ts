import * as Lerc from 'lerc'
import lercWasm from 'lerc/lerc-wasm.wasm?url'
import { createRealWorld, type MapFeature, type WorldExtract } from '../src/real-world.js'
import { tileCoordinate, EARTH_RADIUS, type GeoPoint } from '../src/geography.js'
import type { Entity } from '../src/scene.js'

const CACHE_BASE = import.meta.env.VITE_WORLD_CACHE_URL || ''
const ESRI = CACHE_BASE
  ? `${CACHE_BASE}/elevation`
  : 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile'
const OVERPASS = CACHE_BASE
  ? `${CACHE_BASE}/osm`
  : import.meta.env.VITE_WORLD_OVERPASS_URL || 'https://overpass-api.de/api/interpreter'
let nextRemoteRequest = 0
const CACHE = 'nabla-world-v1'
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
export function overpassFeatures(elements: OsmElement[]): MapFeature[] {
  const result: MapFeature[] = [],
    members = new Set<number>()
  const coordinates = (g: { lat: number; lon: number }[]) =>
    g.map((p) => [p.lon, p.lat] as [number, number])
  const closed = (g: { lat: number; lon: number }[]) =>
    g.length >= 4 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon
  for (const e of elements)
    if (e.type === 'relation' && e.members?.length) {
      const ways = e.members.filter((m) => m.type === 'way')
      if (!ways.length || ways.some((m) => !m.geometry || !closed(m.geometry))) continue
      result.push({
        id: `relation/${e.id}`,
        tags: e.tags ?? {},
        rings: ways.map((m) => ({
          role: m.role || 'outer',
          coordinates: coordinates(m.geometry!),
        })),
      })
      ways.forEach((m) => members.add(m.ref))
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
      e.tags?.natural === 'tree' &&
      e.lat !== undefined &&
      e.lon !== undefined
    )
      result.push({
        id: `node/${e.id}`,
        tags: e.tags,
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
  let cache: Cache | undefined, extract: WorldExtract | undefined
  try {
    cache = await caches.open(CACHE)
    const hit = await cache.match(cacheKey)
    if (hit && Date.now() - Number(hit.headers.get('x-cached-at')) < 30 * 86400000)
      extract = (await hit.json()) as WorldExtract
  } catch {
    /* Storage is optional; exploration still works in private browsers. */
  }
  if (!extract) {
    const nw = sampleGeo(origin, ox - 750, oz - 750),
      se = sampleGeo(origin, ox + 750, oz + 750)
    const box = `${se.latitude},${nw.longitude},${nw.latitude},${se.longitude}`
    const query = `[out:json][timeout:25];(way[building](${box});way["building:part"](${box});way[highway](${box});relation[building](${box});node[natural=tree](${box});way[landuse](${box});way[leisure](${box});way["natural"~"water|wood|beach|sand|scrub|heath|wetland|marsh|grassland"](${box});way[water](${box});way[waterway~"riverbank|dock"](${box});relation[landuse](${box});relation[leisure](${box});relation["natural"~"water|wood"](${box}););out geom;`
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
    extract = {
      name: 'Irún · exploración',
      origin,
      terrain: { columns: 121, rows: 121, spacing: 10, heights },
      features: overpassFeatures(json.elements),
      source: { retrievedAt: new Date().toISOString(), osm: OVERPASS, elevation: ESRI },
    }
    if (cache)
      try {
        await cache.put(
          cacheKey,
          new Response(JSON.stringify(extract), {
            headers: { 'content-type': 'application/json', 'x-cached-at': String(Date.now()) },
          }),
        )
        const keys = await cache.keys()
        for (const old of keys.slice(0, Math.max(0, keys.length - 32))) await cache.delete(old)
      } catch {
        /* Quota failure must not discard usable terrain. */
      }
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
