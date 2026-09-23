import { describe, expect, it } from 'vitest'
import { ecef, localFrame } from './geography.js'
import { Vector3 } from 'three'
import {
  mapTileAt,
  mapTileBounds,
  mapTileChildren,
  mapTileFilename,
  mapTilePath,
  mapTileSample,
  parseMapTilePath,
} from './map-tiles.js'
import { planetTileFrame } from './planet-tile.js'

describe('planet-global tile addressing and geometry', () => {
  it('names the same place independently of the scene and rejects aliases', () => {
    const tile = mapTileAt(43.32969, -1.819606, 15)
    expect(parseMapTilePath(mapTilePath(tile))).toEqual(tile)
    expect(mapTileFilename(tile, 'terrain')).toBe(
      `earth-WebMercatorQuad-z15-x${tile.x}-y${tile.y}-terrain.glb`,
    )
    for (const bad of ['0_0', 'z/15/01/2', 'z/15/32768/0', 'z/15/1/-1', 'z/15/1/2/../source'])
      expect(() => parseMapTilePath(bad)).toThrow()
  })
  it('samples adjacent and parent/child boundaries identically', () => {
    const tile = mapTileAt(41.5034, -5.744, 14)
    const east = { ...tile, x: tile.x + 1 }
    const south = { ...tile, y: tile.y + 1 }
    for (let i = 0; i <= 128; i++) {
      expect(mapTileSample(tile, 128, i, 128)).toEqual(mapTileSample(east, 0, i, 128))
      expect(mapTileSample(tile, i, 128, 128)).toEqual(mapTileSample(south, i, 0, 128))
    }
    const child = mapTileChildren(tile)[0]
    for (let i = 0; i <= 64; i++)
      expect(mapTileSample(tile, i, 0, 128)).toEqual(mapTileSample(child, i * 2, 0, 128))
  })
  it('projects shared borders onto the same planet, from different local frames', () => {
    for (const [lat, lon] of [
      [43.3, -1.8],
      [-33.8, 151.2],
      [80, 25],
    ]) {
      const tile = mapTileAt(lat, lon, 13)
      const left = planetTileFrame(tile),
        right = planetTileFrame({ ...tile, x: tile.x + 1 })
      const global = (f: typeof left, x: number, z: number) =>
        new Vector3(...f.local([x, 73, z]))
          .applyQuaternion(localFrame(f.anchor))
          .add(ecef(f.anchor))
      for (const fraction of [-0.5, -0.25, 0, 0.25, 0.5])
        expect(
          global(left, left.width / 2, left.width * fraction).distanceTo(
            global(right, -right.width / 2, right.width * fraction),
          ),
        ).toBeLessThan(1e-7)
    }
  })
  it('uses the exact XYZ bounds rather than a fixed metre size', () => {
    const tile = mapTileAt(43.32969, -1.819606, 15)
    const f = planetTileFrame(tile),
      b = mapTileBounds(tile)
    expect(f.width).not.toBe(1200)
    const nw = f.point([-f.width / 2, 0, -f.width / 2])
    const se = f.point([f.width / 2, 0, f.width / 2])
    expect(nw.longitude).toBeCloseTo(b.west, 12)
    expect(nw.latitude).toBeCloseTo(b.north, 12)
    expect(se.longitude).toBeCloseTo(b.east, 12)
    expect(se.latitude).toBeCloseTo(b.south, 12)
  })
})

it('keeps a complete parent while grandchildren only provide partial child coverage', async () => {
  const { planetReadyCover, mapTileId } = await import('./map-tiles.js')
  const root = mapTileAt(43, -1, 13),
    children = mapTileChildren(root),
    leaves = children.flatMap(mapTileChildren)
  const plan = {
    roots: [root],
    leaves,
    requests: [root, ...children, ...leaves],
    budgetLimited: false,
  }
  const partial = new Set([
    mapTileId(root),
    ...children.map((c) => mapTileId(mapTileChildren(c)[0])),
  ])
  expect(planetReadyCover(plan, partial)).toEqual([root])
  const full = new Set([mapTileId(root), ...leaves.map(mapTileId)])
  expect(planetReadyCover(plan, full)).toEqual(leaves)
  partial.delete(mapTileId(root))
  expect(planetReadyCover(plan, partial)).toHaveLength(4)
})
