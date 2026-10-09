import { describe, expect, it } from 'vitest'
import {
  GROUND_DRAPE_LIFT,
  ROOF_DRAPE_LIFT,
  buildDrapes,
  type DrapeSource,
} from '../../src/render/planet/drape.js'

const quad = (
  y: number,
  normalY: number,
  metadata: Record<string, unknown>,
  name = 'm',
): DrapeSource => ({
  name,
  position: new Float32Array([-10, y, -10, 10, y, -10, 10, y, 10, -10, y, 10]),
  normal: new Float32Array([0, normalY, 0, 0, normalY, 0, 0, normalY, 0, 0, normalY, 0]),
  index: new Uint32Array([0, 1, 2, 0, 2, 3]),
  metadata,
})

describe('buildDrapes', () => {
  const layers = new Set(['terrain', 'roads', 'roofs', 'grass'])

  it('lifts ground a hair and gives planar UVs across the cell', () => {
    const [drape] = buildDrapes([quad(5, 1, { category: 'Terrain' })], { width: 20, layers })
    expect(drape.id).toBe('terrain')
    expect(drape.position.length).toBe(6 * 3)
    expect(drape.position[1]).toBeCloseTo(5 + GROUND_DRAPE_LIFT)
    // x=-10 over a 20 m cell -> u=0; z=-10 -> v=1 (north up).
    expect([drape.uv[0], drape.uv[1]]).toEqual([0, 1])
  })

  it('floats roofs higher and skips steep roof faces', () => {
    const roof = buildDrapes([quad(9, 1, { category: 'Buildings' })], { width: 20, layers })
    expect(roof[0].id).toBe('roofs')
    expect(roof[0].position[1]).toBeCloseTo(9 + ROOF_DRAPE_LIFT)
    // Wheels rest on the unlifted roof: the visible roof may float at most a few cm (was 15).
    expect(ROOF_DRAPE_LIFT).toBeLessThanOrEqual(0.03)
    expect(buildDrapes([quad(9, 0.1, { category: 'Buildings' })], { width: 20, layers })).toEqual(
      [],
    )
  })

  it('routes land use by ground layer and honours layer switches, skirts and baked drapes', () => {
    const grass = quad(0, 1, { category: 'Surfaces', groundLayer: 10 })
    expect(buildDrapes([grass], { width: 20, layers })[0].id).toBe('grass')
    expect(buildDrapes([grass], { width: 20, layers: new Set(['terrain']) })).toEqual([])
    expect(
      buildDrapes([quad(0, 1, { category: 'Terrain', skirt: true })], { width: 20, layers }),
    ).toEqual([])
    expect(
      buildDrapes([quad(0, 1, { category: 'Roads' }, 'Drape')], { width: 20, layers }),
    ).toEqual([])
    expect(
      buildDrapes([quad(0, 1, { category: 'Roads' })], {
        width: 20,
        layers,
        baked: new Set(['roads']),
      }),
    ).toEqual([])
  })

  it('does not drape unrelated meshes as terrain', () => {
    expect(buildDrapes([quad(0, 1, { category: 'Trees' })], { width: 20, layers })).toEqual([])
  })

  it('handles non-indexed meshes', () => {
    const flat: DrapeSource = { ...quad(0, 1, { category: 'Roads' }), index: undefined }
    const [drape] = buildDrapes(
      [{ ...flat, position: flat.position.slice(0, 9), normal: flat.normal.slice(0, 9) }],
      {
        width: 20,
        layers,
      },
    )
    expect(drape.position.length).toBe(9)
  })

  it('v2+ callers must drop ground-road asphalt before buildDrapes (ghost road guard)', () => {
    // Mirrors the worker filter: ground-road asphalt is removed on v2+ before drapes are cut.
    // Leaving those triangles in would float a roads-photo ghost over terrain.lidar.
    const ground = quad(4, 1, {
      category: 'Roads',
      nablaCandidateRoad: 'asphalt',
      atlasSurfaceRole: 'ground-road',
    })
    const bridge = quad(8, 1, {
      category: 'Roads',
      nablaCandidateRoad: 'asphalt',
      atlasSurfaceRole: 'bridge-deck',
    })
    const terrain = quad(0, 1, { category: 'Terrain' })
    const kept = [ground, bridge, terrain].filter(
      (m) =>
        m.metadata.nablaCandidateRoad !== 'asphalt' ||
        m.metadata.atlasSurfaceRole !== 'ground-road',
    )
    const drapes = buildDrapes(kept, { width: 20, layers: new Set(['roads', 'terrain']) })
    expect(drapes.map((d) => d.id).sort()).toEqual(['roads', 'terrain'])
    const roads = drapes.find((d) => d.id === 'roads')!
    // Only the bridge-deck quad (y=8) feeds the roads drape.
    expect(roads.position[1]).toBeCloseTo(8 + GROUND_DRAPE_LIFT)
  })
})
