import { describe, expect, it } from 'vitest'
import { bakedDrapeLayers, buildDrapes, type DrapeSource } from '../../src/render/planet/drape.js'

// v2+ cells: the unified terrain (terrain.lidar) embeds the final cell texture. Painting the
// ground photo over it and over the bridge asphalt again paid two textures to show one.
const tri = (category: string, extra: Record<string, unknown> = {}): DrapeSource => ({
  name: category,
  position: new Float32Array([0, 1, 0, 10, 1, 0, 0, 1, 10]),
  normal: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
  metadata: { category, ...extra },
})
const all = new Set(['terrain', 'roads', 'roofs'])

describe('v2+ single ground texture', () => {
  const meshes = [tri('Terrain', { nablaTerrainLidar: true }), tri('Roads'), tri('Buildings')]
  const flags = (version: number, terrainMap: boolean) =>
    bakedDrapeLayers(
      meshes.map((m) => ({ ...m, hasMap: m.name === 'Terrain' ? terrainMap : m.name === 'Roads' })),
      version,
    )

  it('v2/v3/v4 terrain with its own texture: no terrain or roads drape', () => {
    for (const v of [2, 3, 4]) {
      const baked = flags(v, true)
      expect(baked).toEqual(new Set(['terrain', 'roads']))
      expect(buildDrapes(meshes, { width: 800, layers: all, baked }).map((d) => d.id)).toEqual([
        'roofs',
      ])
    }
  })

  it('v1 cells keep the ground and roads drape', () => {
    const baked = flags(1, true)
    expect(baked.size).toBe(0)
    expect(
      buildDrapes(meshes, { width: 800, layers: all, baked })
        .map((d) => d.id)
        .sort(),
    ).toEqual(['roads', 'roofs', 'terrain'])
  })

  it('a v2 terrain without an embedded texture still gets the drape', () => {
    expect(flags(2, false).has('terrain')).toBe(false)
  })
})
