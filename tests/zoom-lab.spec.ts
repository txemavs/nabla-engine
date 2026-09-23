import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import {
  mapTileAt,
  mapTileBounds,
  mapTileChildren,
  mapTileId,
  mapTilePath,
  mapTileSample,
} from '../src/map-tiles.js'
import { groundGlb } from './planet-fixture.js'

test('native zoom viewer refines, coarsens and exposes global downloads', async ({ page }) => {
  const bytes = groundGlb(),
    empty = groundGlb(true)
  const parent = mapTileAt(43.32969, -1.819606, 13)
  const middle = mapTileChildren(parent),
    near = middle.flatMap(mapTileChildren)
  const available = Object.fromEntries(
    [parent, ...middle, ...near].map((tile) => [
      mapTilePath(tile),
      {
        format: 'nabla-planet-tile-v1',
        generator: 'native-xyz-v2',
        id: mapTileId(tile),
        tile,
        anchor: mapTileSample(tile, 1, 1, 2),
        bounds: mapTileBounds(tile),
        files: Object.fromEntries(
          ['terrain', 'buildings-osm'].map((name) => {
            const b = name === 'terrain' ? bytes : empty,
              sha256 = createHash('sha256').update(b).digest('hex')
            return [
              name,
              {
                path: `${name}-${sha256.slice(0, 16)}.glb`,
                sha256,
                bytes: b.length,
                download: `nabla-earth-WebMercatorQuad-${tile.z}-${tile.x}-${tile.y}-${name}.glb`,
              },
            ]
          }),
        ),
      },
    ]),
  )
  await page.route('**/prepare/tiles', (route) =>
    route.fulfill({ json: { authorized: true, available } }),
  )
  await page.route('**/prepared/z/**/*.glb', (route) =>
    route.fulfill({
      body: route.request().url().includes('buildings-osm') ? empty : bytes,
      contentType: 'model/gltf-binary',
    }),
  )
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/ImageServer/tile/**', (r) =>
    r.fulfill({ status: 503, body: 'Not used in this test' }),
  )
  await page.goto('/zoom-lab.html')
  await expect(page.locator('canvas')).toHaveAttribute('data-zooms', /15/)
  await expect(page.locator('#files a').first()).toHaveAttribute(
    'download',
    /^nabla-earth-WebMercatorQuad-/,
  )
  await page.click('#far')
  await expect(page.locator('canvas')).toHaveAttribute('data-zooms', '13')
  await page.click('#middle')
  await expect(page.locator('canvas')).toHaveAttribute('data-zooms', /14/)
  expect(errors).toEqual([])
})
