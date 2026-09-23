import * as Lerc from 'lerc'
import wasm from 'lerc/lerc-wasm.wasm?url'
import { mapTileSample, type MapTile } from '../src/map-tiles.js'
import { tileCoordinate } from '../src/geography.js'
import { horizonGeometry } from '../src/planet-horizon.js'
import { mapCache } from './map-cache.js'
const base =
  import.meta.env.VITE_WORLD_ELEVATION_URL ||
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile'
const ready = Lerc.load({ locateFile: () => wasm })
const rasters = new Map<string, Promise<Lerc.LercData>>()
async function raster(x: number, y: number) {
  const key = `12/${y}/${x}`
  if (!rasters.has(key))
    rasters.set(
      key,
      (async () => {
        const url = base + '/' + key,
          cache = mapCache('nabla-elevation-v1')
        let response = await cache.match(url).catch(() => undefined)
        if (!response) response = await fetch(url, { signal: AbortSignal.timeout(20000) })
        if (!response.ok) throw Error('Relief HTTP ' + response.status)
        const bytes = await response.arrayBuffer(),
          result = Lerc.decode(bytes)
        await cache.put(url, new Response(bytes)).catch(() => {})
        return result
      })().catch((e) => {
        rasters.delete(key)
        throw e
      }),
    )
  const result = await rasters.get(key)!
  while (rasters.size > 16) rasters.delete(rasters.keys().next().value!)
  return result
}
self.onmessage = async (event: MessageEvent<{ tile: MapTile }>) => {
  const { tile } = event.data
  try {
    await ready
    const heights: number[] = []
    for (let row = 0; row <= 32; row++)
      for (let col = 0; col <= 32; col++) {
        const geo = mapTileSample(tile, col, row, 32),
          p = tileCoordinate(geo.latitude, geo.longitude, 12)
        const x = ((Math.floor(p.x) % 4096) + 4096) % 4096,
          y = Math.max(0, Math.min(4095, Math.floor(p.y)))
        const d = await raster(x, y),
          u = (p.x - Math.floor(p.x)) * (d.width - 1),
          v = Math.max(0, Math.min(1, p.y - y)) * (d.height - 1)
        const ix = Math.floor(u),
          iy = Math.floor(v),
          fx = u - ix,
          fy = v - iy
        const pixel = (dx: number, dy: number) => {
          const i = Math.min(d.height - 1, iy + dy) * d.width + Math.min(d.width - 1, ix + dx),
            h = d.pixels[0][i]
          if ((d.mask && !d.mask[i]) || !Number.isFinite(h) || h === d.noDataValues?.[0])
            throw Error('Incomplete relief')
          return h
        }
        heights.push(
          (1 - fx) * (1 - fy) * pixel(0, 0) +
            fx * (1 - fy) * pixel(1, 0) +
            (1 - fx) * fy * pixel(0, 1) +
            fx * fy * pixel(1, 1),
        )
      }
    const data = horizonGeometry(tile, heights)
    self.postMessage(
      { tile, data },
      {
        transfer: [
          data.position.buffer,
          data.normal.buffer,
          ...data.blocks.flatMap((b) => [
            b.index.buffer,
            ...b.chunks.map((c) => c.triangles.buffer),
          ]),
        ],
      },
    )
  } catch (error) {
    self.postMessage({ tile, error: String(error) })
  }
}
