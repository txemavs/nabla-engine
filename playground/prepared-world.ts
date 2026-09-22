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
    geometry: Record<string, { position: string; normal: string; index?: string; color?: string }>
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
  function buffer(text: string): ArrayBuffer {
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
export async function loadPrepared(origin: GeoPoint, key: string, signal: AbortSignal) {
  if (!BASE) return undefined
  const url = `${BASE}/${preparedPath(origin, key)}`
  let cache: Cache | undefined, hit: Response | undefined, response: Response | undefined
  try {
    cache = await caches.open('nabla-prepared-v5')
    hit = await cache.match(url)
  } catch {
    /* Optional disk cache. */
  }
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      cache: 'no-cache',
      headers: hit?.headers.get('etag') ? { 'If-None-Match': hit.headers.get('etag')! } : {},
    })
    if (response.status === 304) response = hit
    else if (!response.ok) return undefined
  } catch {
    signal.throwIfAborted()
    response = hit
  }
  if (!response) return undefined
  try {
    const copy = response.clone(),
      result = decodePrepared(await response.json(), origin, key)
    if (cache) {
      await cache.put(url, copy).catch(() => {})
      const keys = await cache.keys()
      for (const old of keys.slice(0, Math.max(0, keys.length - 8))) await cache.delete(old)
    }
    return result
  } catch {
    signal.throwIfAborted()
    return undefined
  }
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
