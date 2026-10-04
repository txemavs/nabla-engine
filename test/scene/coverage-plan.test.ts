import { describe, expect, it } from 'vitest'
import {
  mapTileAt,
  mapTileId,
  planMapCoverage,
  planetReadyCover,
} from '../../src/scene/mercator.js'

describe('planMapCoverage', () => {
  const tiles = [
    { z: 15, x: 16225, y: 11998 },
    { z: 15, x: 16211, y: 12003 },
    { z: 15, x: 16212, y: 12003 },
    { z: 14, x: 8105, y: 6001 },
  ]
  it('requests every zoom-15 tile of the dataset, nearest first, whatever the distance', () => {
    const here = mapTileAt(43.2972, -1.8951, 15)
    expect(here).toMatchObject({ x: 16211, y: 12003 })
    const plan = planMapCoverage(tiles, 43.2972, -1.8951)
    expect(plan.requests.map(mapTileId)).toEqual([
      'WebMercatorQuad/15/16211/12003',
      'WebMercatorQuad/15/16212/12003',
      'WebMercatorQuad/15/16225/11998',
    ])
    expect(plan.roots).toEqual(plan.requests)
    expect(plan.budgetLimited).toBe(false)
  })
  it('re-orders by the player position and covers resident cells only', () => {
    const far = planMapCoverage(tiles, 43.337, -1.7413)
    expect(far.requests[0]).toMatchObject({ x: 16225, y: 11998 })
    const ready = new Set(['WebMercatorQuad/15/16225/11998', 'WebMercatorQuad/15/16212/12003'])
    expect(planetReadyCover(far, ready).map(mapTileId).sort()).toEqual([...ready].sort())
  })
})
