import type { Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mapTileBounds, mapTileId, mapTileSample } from '../src/map-tiles.js'
import { groundGlb } from './planet-fixture.js'
/** Deterministic native XYZ service; no live provider requests in browser tests. */
export async function nativeMap(page: Page) {
  const terrain = groundGlb(),
    buildings = groundGlb(true)
  await page.route('**/prepare/tiles', async (route) => {
    const available = Object.fromEntries(
      route
        .request()
        .postDataJSON()
        .keys.map((key: string) => {
          const [, z, x, y] = key.split('/').map(Number)
          const tile = { z, x, y }
          return [
            key,
            {
              format: 'nabla-planet-tile-v1',
              generator: 'native-xyz-v2',
              id: mapTileId(tile),
              tile,
              anchor: mapTileSample(tile, 1, 1, 2),
              bounds: mapTileBounds(tile),
              files: Object.fromEntries(
                ['terrain', 'buildings-osm'].map((name) => {
                  const b = name === 'terrain' ? terrain : buildings,
                    sha256 = createHash('sha256').update(b).digest('hex')
                  return [
                    name,
                    {
                      path: `${name}-${sha256.slice(0, 16)}.glb`,
                      sha256,
                      bytes: b.length,
                      download: `${name}.glb`,
                    },
                  ]
                }),
              ),
            },
          ]
        }),
    )
    await route.fulfill({ json: { authorized: false, accepted: 0, available } })
  })
  await page.route('**/prepared/z/**/*.glb', (route) =>
    route.fulfill({
      body: route.request().url().includes('buildings-osm') ? buildings : terrain,
      contentType: 'model/gltf-binary',
    }),
  )
  await page.route('**/ImageServer/tile/**', (route) =>
    route.fulfill({ status: 503, body: 'Native fixture has ground' }),
  )
}
