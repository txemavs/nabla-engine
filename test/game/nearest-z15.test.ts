import { expect, it } from 'vitest'
import { nearestExtraZ15 } from '../../src/runtime/nearest-z15.js'
import { mapTileId, mapTileSample } from '../../src/scene/mercator.js'
const here = { z: 15, x: 16224, y: 11998 }
it.each([
  [1, 5, -1, 0],
  [9, 5, 1, 0],
  [5, 1, 0, -1],
  [5, 9, 0, 1],
])('selects the nearest boundary (%s,%s)', (x, y, dx, dy) => {
  const p = mapTileSample(here, x, y, 10)
  expect(nearestExtraZ15(p.latitude, p.longitude, [])).toEqual({
    z: 15,
    x: here.x + dx,
    y: here.y + dy,
  })
})
it('excludes both the containing cell and previously loaded neighbours', () => {
  const p = mapTileSample(here, 9, 5, 10)
  const loaded = [mapTileId(here), mapTileId({ ...here, x: here.x + 1 })]
  const next = nearestExtraZ15(p.latitude, p.longitude, loaded)!
  expect(loaded).not.toContain(mapTileId(next))
})
it('wraps at the dateline without producing invalid tile indices', () => {
  expect(nearestExtraZ15(0.005, 179.9999, [])?.x).toBe(0)
})
