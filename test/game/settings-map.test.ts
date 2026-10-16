import { describe, expect, it } from 'vitest'
import { tileMapLayout } from '../../game/settings-map.js'

describe('streaming map extent', () => {
  it('covers all known cells without a fixed grid or generating empty cells', () => {
    const cells = tileMapLayout([
      { tile: { z: 15, x: 100, y: 200 }, kind: 'mesh', state: 'resident' },
      { tile: { z: 15, x: 110, y: 220 }, kind: 'mesh', state: 'downloading' },
    ])
    expect(cells).toHaveLength(2)
    expect(cells[0].left).toBe(0)
    expect(cells[0].top).toBe(0)
    expect(cells[1].left + cells[1].width).toBeCloseTo(100)
    expect(cells[1].top + cells[1].height).toBeCloseTo(100)
    expect(cells[1].state).toBe('downloading')
  })
  it('aligns different zoom levels in the same geographic extent', () => {
    const cells = tileMapLayout([
      { tile: { z: 14, x: 10, y: 20 }, kind: 'mesh', state: 'visible' },
      { tile: { z: 15, x: 22, y: 40 }, kind: 'mesh', state: 'planned' },
    ])
    expect(cells[0].width).toBeCloseTo(200 / 3)
    expect(cells[1].left).toBeCloseTo(200 / 3)
    expect(cells[1].width).toBeCloseTo(100 / 3)
  })
  it('handles a scene without tile streaming', () => expect(tileMapLayout([])).toEqual([]))
})
