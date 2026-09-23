import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { planetTileAsset } from '../services/world-cache/planet-geometry.js'
import { mapTileAt, mapTileBounds } from './map-tiles.js'
import type { PlanetTileSource } from './planet-tile.js'

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
