import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mapTileAt, mapTileBounds, mapTileChildren, mapTileId } from '../src/map-tiles.js'

function triangleGlb() {
  const binary = Buffer.from(new Float32Array([-50, 0, -50, 50, 0, -50, 0, 0, 50]).buffer)
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [{ byteLength: binary.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [-50, 0, -50],
          max: [50, 0, 50],
        },
      ],
    }),
  )
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20)
  json.copy(padded)
  const result = Buffer.alloc(12 + 8 + padded.length + 8 + binary.length)
  result.writeUInt32LE(0x46546c67, 0)
  result.writeUInt32LE(2, 4)
  result.writeUInt32LE(result.length, 8)
  result.writeUInt32LE(padded.length, 12)
  result.writeUInt32LE(0x4e4f534a, 16)
  padded.copy(result, 20)
  const offset = 20 + padded.length
  result.writeUInt32LE(binary.length, offset)
  result.writeUInt32LE(0x004e4942, offset + 4)
  binary.copy(result, offset + 8)
  return result
}

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
          path: `${tile.z}/${tile.x}/${tile.y}/terrain-${hash.slice(0, 16)}.glb`,
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
