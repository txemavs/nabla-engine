import { mapCache, type MapCache } from './map-cache.js'
import { decodeSea } from './water-geometry.js'
import type { GeoPoint } from '../src/geography.js'
const endpoint =
  import.meta.env.VITE_WATER_TILEJSON_URL || 'https://tiles.openfreemap.org/planet/latest'
let template: Promise<string> | undefined
async function cached(url: string): Promise<Response> {
  let cache: MapCache | undefined, hit: Response | undefined
  try {
    cache = mapCache('nabla-water-v1')
    hit = await cache.match(url)
    if (hit && Date.now() - Number(hit.headers.get('x-cached-at')) < 7 * 86400000) return hit
  } catch {
    /* Optional browser storage. */
  }
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`Water HTTP ${response.status}`)
  } catch (error) {
    if (hit) return hit
    throw error
  }
  const data = await response.arrayBuffer()
  if (data.byteLength > 8000000) throw new Error('Water tile too large')
  const headers = new Headers(response.headers)
  headers.set('x-cached-at', String(Date.now()))
  const result = new Response(data, { headers })
  if (cache)
    try {
      await cache.put(url, result.clone())
    } catch {
      /* Continue with the downloaded tile. */
    }
  return result
}
self.onmessage = async (event: MessageEvent<{ key: string; origin: GeoPoint }>) => {
  const { key, origin } = event.data
  try {
    template ??= cached(endpoint)
      .then((r) => r.json())
      .then((json) => {
        if (!json.tiles?.[0]) throw new Error('Missing water tile template')
        return new URL(json.tiles[0], endpoint).href
      })
      .catch((e) => {
        template = undefined
        throw e
      })
    const [z, x, y] = key.split('/').map(Number)
    const url = (await template)
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y))
      .replace(/%7Bz%7D/gi, String(z))
      .replace(/%7Bx%7D/gi, String(x))
      .replace(/%7By%7D/gi, String(y))
    const positions = decodeSea(await (await cached(url)).arrayBuffer(), x, y, z, origin)
    self.postMessage({ key, positions }, { transfer: [positions.buffer] })
  } catch (e) {
    self.postMessage({ key, error: e instanceof Error ? e.message : String(e) })
  }
}
