import { decodePreparedBinary, PREPARED_BINARY_LIMIT } from '../src/prepared-binary.js'
import { mapCache, mapCacheStats, type MapCache } from './map-cache.js'
import { parseScene, createEntity, type Entity } from '../src/scene.js'
import type { GeoPoint } from '../src/geography.js'
import type { PreparedMapGeometry } from './map-geometry.js'

export const PREPARED_VERSION = 5
export function preparedPath(origin: GeoPoint, key: string): string {
  return `${PREPARED_VERSION}/${origin.latitude.toFixed(6)}/${origin.longitude.toFixed(6)}/${origin.altitude.toFixed(3)}/${key}.json`
}
export function decodePrepared(
  value: unknown,
  origin: GeoPoint,
  key: string,
): { entities: Entity[]; geometry: PreparedMapGeometry } {
  const data = value as {
    version: number
    origin: GeoPoint
    key: string
    entities: Entity[]
    geometry: Record<
      string,
      {
        position: string | ArrayBuffer
        normal: string | ArrayBuffer
        index?: string | ArrayBuffer
        color?: string | ArrayBuffer
      }
    >
  }
  if (
    !data ||
    data.version !== PREPARED_VERSION ||
    data.key !== key ||
    Math.abs(data.origin?.latitude - origin.latitude) > 0.000001 ||
    Math.abs(data.origin?.longitude - origin.longitude) > 0.000001 ||
    Math.abs(data.origin?.altitude - origin.altitude) > 0.001 ||
    !data.origin ||
    ![data.origin.latitude, data.origin.longitude, data.origin.altitude].every(Number.isFinite) ||
    !data.geometry
  )
    throw Error('Incompatible prepared zone')
  const entities = parseScene({
    version: 1,
    name: 'Prepared zone',
    entities: [...data.entities, createEntity('__prepared_validation_spawn', 'spawn')],
  }).entities.filter((e) => e.id !== '__prepared_validation_spawn')
  const geometry: PreparedMapGeometry = Object.create(null)
  function buffer(text: string | ArrayBuffer): ArrayBuffer {
    if (text instanceof ArrayBuffer) {
      if (text.byteLength % 4) throw Error('Unaligned buffer')
      return text
    }
    if (typeof text !== 'string' || text.length > 64 * 1024 * 1024)
      throw Error('Invalid prepared buffer')
    const raw = atob(text)
    if (raw.length % 4) throw Error('Unaligned buffer')
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    return bytes.buffer
  }
  for (const e of entities) {
    const g = data.geometry[e.id]
    if (!g) continue
    const position = new Float32Array(buffer(g.position)),
      normal = new Float32Array(buffer(g.normal)),
      index = g.index ? new Uint32Array(buffer(g.index)) : undefined,
      color = g.color ? new Float32Array(buffer(g.color)) : undefined
    if (
      position.length !== normal.length ||
      (color &&
        (color.length !== position.length ||
          !color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))) ||
      position.length % 3 ||
      !position.every(Number.isFinite) ||
      !normal.every(Number.isFinite) ||
      index?.some((i) => i >= position.length / 3)
    )
      throw Error('Invalid geometry')
    geometry[e.id] = { position, normal, index, color }
  }
  return { entities, geometry }
}
const BASE = import.meta.env.VITE_WORLD_PREPARED_URL || ''
async function fetchPrepared(
  origin: GeoPoint,
  key: string,
  signal: AbortSignal,
  binary: boolean,
  base: string,
  speculative = false,
): Promise<Response | undefined> {
  if (!base) return undefined
  const url = `${base}/${preparedPath(origin, key).replace(/\.json$/, binary ? '.bin' : '.json')}`
  let cache: MapCache | undefined, hit: Response | undefined, response: Response | undefined
  try {
    cache = mapCache('nabla-prepared-v5')
    hit = await cache.match(url)
  } catch {
    /* Optional disk cache. */
  }
  signal.throwIfAborted()
  if (hit && Date.now() - Number(hit.headers.get('x-nabla-stored-at')) < 5 * 60_000) return hit
  if (speculative) {
    try {
      const stats = await mapCacheStats()
      if (stats.budget - stats.bytes < 1_000_000) return undefined
    } catch {
      return undefined
    }
  }
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      cache: 'no-cache',
      headers: hit?.headers.get('etag') ? { 'If-None-Match': hit.headers.get('etag')! } : {},
    })
    if (response.status === 304 || !response.ok) response = hit
  } catch {
    signal.throwIfAborted()
    response = hit
  }
  if (!response) return undefined
  // Bound speculative downloads before retaining them. Full scene validation happens on load.
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > PREPARED_BINARY_LIMIT || bytes.byteLength < 8) return undefined
  if (binary && new DataView(bytes).getUint32(0, true) !== 0x315a424e) return undefined
  if (!binary && !response.headers.get('content-type')?.includes('json')) return undefined
  if (speculative) {
    const stats = await mapCacheStats()
    if (stats.bytes + bytes.byteLength > stats.budget) return undefined
  }
  const result = new Response(bytes, { headers: response.headers })
  signal.throwIfAborted()
  if (cache) await cache.put(url, result.clone(), !speculative).catch(() => {})
  return result
}
/** Fetch into the disk budget only: no scene parsing, mesh generation or transfer to the main thread. */
export async function prefetchPrepared(
  origin: GeoPoint,
  key: string,
  signal: AbortSignal,
  base = BASE,
): Promise<boolean> {
  return !!(
    (await fetchPrepared(origin, key, signal, true, base, true)) ??
    (await fetchPrepared(origin, key, signal, false, base, true))
  )
}
export async function loadPrepared(
  origin: GeoPoint,
  key: string,
  signal: AbortSignal,
  base = BASE,
) {
  for (const binary of [true, false]) {
    try {
      const response = await fetchPrepared(origin, key, signal, binary, base)
      if (!response) continue
      const value = binary
        ? decodePreparedBinary(await response.arrayBuffer())
        : await response.json()
      return decodePrepared(value, origin, key)
    } catch {
      signal.throwIfAborted()
      // Old servers and invalid artifacts fall back to JSON, then the ordinary provider.
    }
  }
  return undefined
}

/** The browser only queues work after the owner has enabled a private session. */
export class PreparationClient {
  private blocked = false
  private busy = false
  private next = 0
  private last = ''
  async enqueue(origin: GeoPoint, keys: string[]) {
    const base = import.meta.env.VITE_WORLD_PREPARE_API || ''
    if (!base || this.blocked || this.busy || Date.now() < this.next) return
    const signature = JSON.stringify([origin, keys])
    if (signature === this.last) return
    this.busy = true
    this.next = Date.now() + 5000
    try {
      const response = await fetch(`${base}/zones`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, keys: keys.slice(0, 24) }),
        signal: AbortSignal.timeout(5000),
      })
      if (response.status === 401) this.blocked = true
      else if (response.ok) {
        const result = (await response.json()) as { accepted: number }
        if (result.accepted >= keys.length) this.last = signature
      } else this.next = Date.now() + 60000
    } catch {
      this.next = Date.now() + 30000
    } finally {
      this.busy = false
    }
  }
}
