import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { planetTileAsset } from '#world-cache/planet/planet-geometry.js'
import { roofCell, roofUv } from '#world-cache/planet/roof-imagery.js'
import { mapTileAt, mapTileBounds } from '../../../src/scene/mercator.js'
import type { PlanetTileSource } from '../../../src/planet/index.js'

it('builds native XYZ terrain and buildings without any local prepared input', () => {
  const tile = mapTileAt(43.32969, -1.819606, 15)
  const b = mapTileBounds(tile),
    cx = (b.west + b.east) / 2,
    cy = (b.south + b.north) / 2
  const source: PlanetTileSource = {
    format: 'nabla-planet-source-v1',
    tile,
    retrievedAt: '2026-09-23T00:00:00Z',
    elevation: { segments: 32, heights: Array(33 ** 2).fill(40), provider: 'esri-terrain-3d' },
    features: [
      {
        id: 'way/1',
        tags: { building: 'yes', height: '12', 'roof:colour': '#ff0000' },
        rings: [
          {
            role: 'outer',
            coordinates: [
              [cx, cy],
              [cx + 0.0002, cy],
              [cx + 0.0002, cy + 0.0002],
              [cx, cy + 0.0002],
              [cx, cy],
            ],
          },
        ],
      },
    ],
  }
  const { root, frame, geometry } = planetTileAsset(source)
  expect(root.userData.nablaTile.id).toBe(`WebMercatorQuad/${tile.z}/${tile.x}/${tile.y}`)
  expect(root.userData.nablaTile.anchor).toEqual(frame.anchor)
  expect(root.children.map((c) => c.name)).toContain('Buildings')
  const ground = Object.entries(geometry).find(([key]) => key.startsWith('world-terrain'))![1]
  const corner = new Vector3(...frame.local([-frame.width / 2, 40, -frame.width / 2]))
  expect(new Vector3().fromArray(ground.position).distanceTo(corner)).toBeLessThan(0.0001)
  expect([...ground.position, ...ground.normal].every(Number.isFinite)).toBe(true)
  expect(() =>
    planetTileAsset({ ...source, elevation: { ...source.elevation, heights: [] } }),
  ).toThrow()
})
it('drapes landcover across fractional XYZ tile borders without treating rounding as missing coverage', () => {
  const tile = mapTileAt(43.32969, -1.819606, 15),
    b = mapTileBounds(tile)
  const source: PlanetTileSource = {
    format: 'nabla-planet-source-v1',
    tile,
    retrievedAt: '2026-09-23T00:00:00Z',
    elevation: { segments: 128, heights: Array(129 ** 2).fill(20), provider: 'esri-terrain-3d' },
    features: [
      {
        id: 'way/2',
        tags: { landuse: 'grass' },
        rings: [
          {
            role: 'outer',
            coordinates: [
              [b.west - 0.001, b.north + 0.001],
              [b.east + 0.001, b.north + 0.001],
              [b.east + 0.001, b.south - 0.001],
              [b.west - 0.001, b.south - 0.001],
              [b.west - 0.001, b.north + 0.001],
            ],
          },
        ],
      },
    ],
  }
  const result = planetTileAsset(source)
  expect(Object.values(result.geometry).every((g) => g.position.every(Number.isFinite))).toBe(true)
  expect(Object.keys(result.geometry).some((k) => k.includes('land'))).toBe(true)
})
it('maps a zoom-13 roof onto the zoom-15 cell under it, north at the top of the photo', () => {
  const tile = { z: 13, x: 100, y: 200 }
  const northWest = roofCell(tile, 0.1, 0.9)
  expect(northWest.tile).toEqual({ z: 15, x: 400, y: 800 })
  expect(roofUv(northWest.n, northWest.col, northWest.row, 0.1, 0.9)[0]).toBeCloseTo(0.4)
  expect(roofUv(northWest.n, northWest.col, northWest.row, 0.1, 0.9)[1]).toBeCloseTo(0.4)
  const southEast = roofCell(tile, 0.99, 0.01)
  expect(southEast.tile).toEqual({ z: 15, x: 403, y: 803 })
  const same = roofUv(1, 0, 0, 0.3, 0.7)
  expect(same[0]).toBeCloseTo(0.3)
  expect(same[1]).toBeCloseTo(0.3)
})
