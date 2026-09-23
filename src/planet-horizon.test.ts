import { it, expect } from 'vitest'
import { horizonGeometry, coversTile } from './planet-horizon.js'
import { mapTileAt } from './map-tiles.js'
import { planetTileFrame } from './planet-tile.js'
it('builds real curved relief with independently replaceable XYZ children and collision triangles', () => {
  const tile = mapTileAt(43.32969, -1.819606, 13),
    data = horizonGeometry(tile, Array(33 * 33).fill(120))
  expect(data.blocks).toHaveLength(16)
  expect(data.blocks.every((b) => coversTile(tile, b.tile))).toBe(true)
  expect(data.blocks.reduce((n, b) => n + b.index.length, 0)).toBe(32 * 32 * 6)
  expect(
    data.blocks.reduce((n, b) => n + b.chunks.reduce((k, c) => k + c.triangles.length / 9, 0), 0),
  ).toBe(32 * 32 * 2)
  const center = planetTileFrame(tile).local([0, 120, 0])
  expect(data.position[(16 * 33 + 16) * 3 + 1]).toBeCloseTo(center[1], 3)
  const removed = data.blocks[5].tile
  const remaining = data.blocks.filter((b) => !coversTile(removed, b.tile))
  expect(remaining).toHaveLength(15)
  expect(
    remaining.every((b) =>
      b.chunks.every((c) => !c.key.startsWith(`WebMercatorQuad/15/${removed.x}/${removed.y}:`)),
    ),
  ).toBe(true)
})
