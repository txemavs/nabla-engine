import { expect, test } from 'vitest'
import {
  mapTileBounds,
  mapTileChildren,
  mapTileId,
  mapTileParent,
  mapTileSample,
  mergeReadyMapCover,
  planetReadyCover,
  planMapZooms,
  readyMapCover,
} from '../../src/scene/mercator.js'

const parent = { z: 15, x: 16224, y: 11998 }
const children = mapTileChildren(parent)
const at = mapTileSample(parent, 1, 1, 2)
const options = {
  ...at,
  heightAboveGround: 0,
  viewDistance: 100,
  maxZoom: 16 as const,
  maxTiles: 5,
}

test('Zaisa uses four true Z16 addresses with exact shared edges', () => {
  expect(children).toEqual([
    { z: 16, x: 32448, y: 23996 },
    { z: 16, x: 32449, y: 23996 },
    { z: 16, x: 32448, y: 23997 },
    { z: 16, x: 32449, y: 23997 },
  ])
  for (const child of children) expect(mapTileParent(child)).toEqual(parent)
  const [nw, ne, sw, se] = children.map(mapTileBounds)
  expect(nw.east).toBe(ne.west)
  expect(nw.south).toBe(sw.north)
  expect(sw.east).toBe(se.west)
  for (let i = 0; i <= 32; i++)
    expect(mapTileSample(parent, i, 0, 64)).toEqual(mapTileSample(children[0], i * 2, 0, 64))
})

test('opt-in Z16 requests its parent plus a complete quartet, within budget', () => {
  const plan = planMapZooms(options)
  expect(plan.roots).toEqual([parent])
  expect(plan.leaves).toEqual(children)
  expect(plan.requests).toEqual([parent, ...children])
  for (let budget = 1; budget < 5; budget++) {
    const limited = planMapZooms({ ...options, maxTiles: budget })
    expect(limited.requests.length).toBeLessThanOrEqual(budget)
    expect(limited.requests.every((t) => t.z === 15)).toBe(true)
  }
  expect(planMapZooms({ ...options, maxZoom: undefined }).requests.every((t) => t.z === 15)).toBe(
    true,
  )
})

test('every incomplete quartet retains its parent; complete children replace it atomically', () => {
  const plan = planMapZooms(options)
  for (let mask = 0; mask < 16; mask++) {
    const readyChildren = children.filter((_, i) => mask & (1 << i))
    const ready = new Set([parent, ...readyChildren].map(mapTileId))
    const expected = mask === 15 ? children : [parent]
    expect(readyMapCover(plan, ready)).toEqual(expected)
    expect(planetReadyCover(plan, ready)).toEqual(expected)
    expect(mergeReadyMapCover([parent], readyChildren)).toEqual(expected)
    expect(mergeReadyMapCover(readyChildren, [parent])).toEqual(expected)
    ready.delete(mapTileId(parent))
    expect(planetReadyCover(plan, ready)).toEqual(readyChildren)
  }
})

test('Z16 geographic extremes, lookahead and coarse ancestry remain bounded', () => {
  for (const longitude of [-180, 179.999]) {
    const plan = planMapZooms({
      ...options,
      longitude,
      minZoom: 12,
      adaptive: true,
      maxTiles: 96,
      viewDistance: 8000,
    })
    expect(plan.requests.length).toBeLessThanOrEqual(96)
    expect(new Set(plan.requests.map(mapTileId)).size).toBe(plan.requests.length)
    expect(plan.requests.some((t) => t.z === 16)).toBe(true)
    expect(planetReadyCover(plan, new Set(plan.requests.map(mapTileId)))).toEqual(plan.leaves)
  }
})
