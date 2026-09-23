import { expect, test } from 'vitest'
import {
  mapTileAt,
  mapTileBounds,
  mapTileChildren,
  mapTileGroundWidth,
  mapTileId,
  mapTileParent,
  parseMapTileId,
  planMapZooms,
  readyMapCover,
  MERCATOR_LIMIT,
} from './map-tiles.js'

test('XYZ matches equator, Greenwich and dateline conventions', () => {
  expect(mapTileAt(0, 0, 1)).toEqual({ z: 1, x: 1, y: 1 })
  expect(mapTileAt(0, 180, 1)).toEqual(mapTileAt(0, -180, 1))
  expect(mapTileBounds({ z: 0, x: 0, y: 0 })).toEqual({
    west: -180,
    east: 180,
    north: MERCATOR_LIMIT,
    south: -MERCATOR_LIMIT,
  })
  expect(() => mapTileAt(90, 0, 15)).toThrow(/polar/)
})

test('canonical identifiers are independent of city, altitude and scene frame', () => {
  for (const latitude of [-80, 0, 41.5033, 43.32969, 80])
    for (const longitude of [-180, -5.7446, -1.819606, 179.999])
      for (const z of [13, 14, 15]) {
        const tile = mapTileAt(latitude, longitude, z)
        const bounds = mapTileBounds(tile)
        expect(
          mapTileAt((bounds.north + bounds.south) / 2, (bounds.east + bounds.west) / 2, z),
        ).toEqual(tile)
        expect(parseMapTileId(mapTileId(tile))).toEqual(tile)
        expect(mapTileAt(latitude, longitude + 360, z)).toEqual(tile)
      }
  for (const id of [
    'WebMercatorQuad/013/0/0',
    'WebMercatorQuad/13/8192/0',
    'WebMercatorQuad/13/0/-1',
    '../0/0',
    'WebMercatorQuad/99/0/0',
  ])
    expect(() => parseMapTileId(id)).toThrow()
})

test('four children exactly partition their parent', () => {
  const parent = mapTileAt(43.32969, -1.819606, 13)
  const [nw, ne, sw, se] = mapTileChildren(parent).map(mapTileBounds)
  const bounds = mapTileBounds(parent)
  expect(nw.west).toBe(bounds.west)
  expect(ne.east).toBe(bounds.east)
  expect(nw.north).toBe(bounds.north)
  expect(sw.south).toBe(bounds.south)
  expect(nw.east).toBe(ne.west)
  expect(nw.south).toBe(sw.north)
  expect(sw.east).toBe(se.west)
  for (const child of mapTileChildren(parent)) expect(mapTileParent(child)).toEqual(parent)
})

const options = {
  latitude: 43.32969,
  longitude: -1.819606,
  heightAboveGround: 0,
  viewDistance: 8000,
}
const ancestor = (a: ReturnType<typeof mapTileAt>, b: ReturnType<typeof mapTileAt>) =>
  a.z < b.z &&
  Math.floor(b.x / 2 ** (b.z - a.z)) === a.x &&
  Math.floor(b.y / 2 ** (b.z - a.z)) === a.y

test('three zooms cover one neighborhood without overlapping parents', () => {
  const plan = planMapZooms(options)
  expect(new Set(plan.leaves.map((t) => t.z))).toEqual(new Set([13, 14, 15]))
  expect(plan.leaves.length).toBeLessThanOrEqual(96)
  for (const a of plan.leaves) for (const b of plan.leaves) expect(ancestor(a, b)).toBe(false)
  expect(readyMapCover(plan, new Set(plan.requests.map(mapTileId)))).toEqual(plan.leaves)
  expect(mapTileGroundWidth(options.latitude, 15)).toBeGreaterThan(880)
  expect(mapTileGroundWidth(options.latitude, 15)).toBeLessThan(900)
})

test('an incomplete child set keeps its parent; completed refinement switches atomically', () => {
  const root = mapTileAt(options.latitude, options.longitude, 14)
  const children = mapTileChildren(root)
  const plan = {
    roots: [root],
    leaves: children,
    requests: [root, ...children],
    budgetLimited: false,
  }
  const ready = new Set([root, ...children.slice(0, 3)].map(mapTileId))
  expect(readyMapCover(plan, ready)).toEqual([root])
  ready.add(mapTileId(children[3]))
  expect(readyMapCover(plan, ready)).toEqual(children)
  ready.delete(mapTileId(root))
  ready.delete(mapTileId(children[3]))
  expect(readyMapCover(plan, ready)).toEqual([])
})

test('flight height reduces detail; budgets and antimeridian stay bounded', () => {
  expect(
    new Set(planMapZooms({ ...options, heightAboveGround: 4000 }).leaves.map((t) => t.z)),
  ).toEqual(new Set([13]))
  const small = planMapZooms({ ...options, maxTiles: 4 })
  expect(small.budgetLimited).toBe(true)
  expect(small.leaves.length).toBeLessThanOrEqual(4)
  const dateline = planMapZooms({ ...options, longitude: 179.999 })
  expect(dateline.roots.some((t) => t.x === 0)).toBe(true)
  expect(dateline.roots.some((t) => t.x === 8191)).toBe(true)
  expect(new Set(dateline.requests.map(mapTileId)).size).toBe(dateline.requests.length)
  const polar = planMapZooms({ ...options, latitude: MERCATOR_LIMIT, viewDistance: 1e9 })
  expect(polar.budgetLimited).toBe(true)
  expect(polar.leaves.length).toBeLessThanOrEqual(96)
  for (const tile of polar.requests) expect(() => mapTileId(tile)).not.toThrow()
})
