import { describe, it, expect } from 'vitest'
import { mapTileAt, mapTileId } from '../../src/scene/mercator.js'

describe('loading screen grid logic', () => {
  const ZAISA_IRUN = {
    latitude: 43.3372,
    longitude: -1.7523,
  }

  describe('3x3 tile grid calculation', () => {
    it('calculates center tile for Zaisa', () => {
      const center = mapTileAt(ZAISA_IRUN.latitude, ZAISA_IRUN.longitude, 15)

      expect(center.z).toBe(15)
      expect(center.x).toBe(16224)
      expect(center.y).toBe(11998)
    })

    it('generates correct 3x3 grid around center', () => {
      const center = mapTileAt(ZAISA_IRUN.latitude, ZAISA_IRUN.longitude, 15)
      const n = 2 ** 15

      const tiles: { z: number; x: number; y: number }[] = []
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const y = center.y + dy
          if (y < 0 || y >= n) continue
          tiles.push({
            z: 15,
            x: (center.x + dx + n) % n,
            y,
          })
        }
      }

      expect(tiles).toHaveLength(9)

      const ids = tiles.map(mapTileId)
      expect(ids).toContain('WebMercatorQuad/15/16223/11997')
      expect(ids).toContain('WebMercatorQuad/15/16224/11997')
      expect(ids).toContain('WebMercatorQuad/15/16225/11997')
      expect(ids).toContain('WebMercatorQuad/15/16223/11998')
      expect(ids).toContain('WebMercatorQuad/15/16224/11998')
      expect(ids).toContain('WebMercatorQuad/15/16225/11998')
      expect(ids).toContain('WebMercatorQuad/15/16223/11999')
      expect(ids).toContain('WebMercatorQuad/15/16224/11999')
      expect(ids).toContain('WebMercatorQuad/15/16225/11999')
    })

    it('handles tiles near the antimeridian', () => {
      const nearDateLine = mapTileAt(43.3372, 179.99, 15)
      const n = 2 ** 15

      const tiles: { z: number; x: number; y: number }[] = []
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const y = nearDateLine.y + dy
          if (y < 0 || y >= n) continue
          tiles.push({
            z: 15,
            x: (nearDateLine.x + dx + n) % n,
            y,
          })
        }
      }

      expect(tiles).toHaveLength(9)
      expect(tiles.some((t) => t.x === 0)).toBe(true)
      expect(tiles.some((t) => t.x === n - 1)).toBe(true)
    })

    it('handles tiles near the north pole boundary', () => {
      const nearPole = mapTileAt(85, -1.7523, 15)
      const n = 2 ** 15

      const tiles: { z: number; x: number; y: number }[] = []
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const y = nearPole.y + dy
          if (y < 0 || y >= n) continue
          tiles.push({
            z: 15,
            x: (nearPole.x + dx + n) % n,
            y,
          })
        }
      }

      expect(tiles.length).toBeLessThanOrEqual(9)
      expect(tiles.every((t) => t.y >= 0 && t.y < n)).toBe(true)
    })
  })

  describe('loading progress tracking', () => {
    it('tracks loaded tiles correctly', () => {
      const loadedTiles = new Set<string>()
      const grid = [
        'WebMercatorQuad/15/16223/11997',
        'WebMercatorQuad/15/16224/11997',
        'WebMercatorQuad/15/16225/11997',
        'WebMercatorQuad/15/16223/11998',
        'WebMercatorQuad/15/16224/11998',
        'WebMercatorQuad/15/16225/11998',
        'WebMercatorQuad/15/16223/11999',
        'WebMercatorQuad/15/16224/11999',
        'WebMercatorQuad/15/16225/11999',
      ]

      const isComplete = () => grid.every((id) => loadedTiles.has(id))
      const progress = () => ({
        total: grid.length,
        loaded: loadedTiles.size,
      })

      expect(isComplete()).toBe(false)
      expect(progress().loaded).toBe(0)

      loadedTiles.add(grid[0])
      loadedTiles.add(grid[1])
      loadedTiles.add(grid[4])

      expect(isComplete()).toBe(false)
      expect(progress().loaded).toBe(3)

      for (const id of grid) loadedTiles.add(id)

      expect(isComplete()).toBe(true)
      expect(progress().loaded).toBe(9)
    })
  })
})
