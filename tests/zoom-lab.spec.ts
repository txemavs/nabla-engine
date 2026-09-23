import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mapTileAt, mapTileBounds, mapTileChildren, mapTileId } from '../src/map-tiles.js'

import { triangleGlb } from './xyz-fixture.js'

test('published zoom viewer loads actual GLBs, refines, coarsens and exposes downloads', async ({
  page,
}) => {
  const bytes = triangleGlb(),
    hash = createHash('sha256').update(bytes).digest('hex')
  const parent = mapTileAt(43.32969, -1.819606, 13)
  const middle = mapTileChildren(parent),
    near = middle.flatMap(mapTileChildren)
  const tiles = [parent, ...middle, ...near].map((tile) => {
    const bounds = mapTileBounds(tile),
      rad = Math.PI / 180,
      r = 6378137
    return {
      ...tile,
      id: mapTileId(tile),
      bounds,
      projectedCenter: [
        ((r * (bounds.west + bounds.east)) / 2) * rad,
        (-r *
          (Math.asinh(Math.tan(bounds.north * rad)) + Math.asinh(Math.tan(bounds.south * rad)))) /
          2,
      ],
      triangles: 1,
      sourceTriangles: 1,
      files: {
        terrain: {
          path: `z/${tile.z}/${tile.x}/${tile.y}/terrain-${hash.slice(0, 16)}.glb`,
          bytes: bytes.length,
          sha256: hash,
        },
      },
    }
  })
  await page.route('**/experiments/xyz-flight/catalog.json', (route) =>
    route.fulfill({ json: { format: 'nabla-xyz-pilot-v1', partialCoverage: true, tiles } }),
  )
  await page.route('**/experiments/xyz-flight/**/*.glb', (route) =>
    route.fulfill({ body: bytes, contentType: 'model/gltf-binary' }),
  )
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/zoom-lab.html')
  await expect(page.locator('canvas')).toHaveAttribute('data-zooms', /15/)
  await expect(page.locator('#files a').first()).toHaveAttribute(
    'download',
    /^nabla-earth-WebMercatorQuad-/,
  )
  await page.click('#far')
  await expect(page.locator('canvas')).toHaveAttribute('data-zooms', '13')
  await page.click('#middle')
  await expect(page.locator('canvas')).toHaveAttribute('data-zooms', '14')
  expect(errors).toEqual([])
})
