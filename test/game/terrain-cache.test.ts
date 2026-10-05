import { describe, expect, it } from 'vitest'
import { CACHE_STORAGE_KEY, DEFAULT_CACHE, currentCacheSettings } from '../../game/terrain-cache.js'

const storage = (value?: string) => ({
  getItem: (key: string) => (key === CACHE_STORAGE_KEY ? (value ?? null) : null),
  setItem: () => {},
})

describe('game terrain cache settings', () => {
  it('defaults to a disk cache big enough for package cells', () => {
    expect(DEFAULT_CACHE.diskMb).toBeGreaterThanOrEqual(500)
    expect(currentCacheSettings('', storage())).toEqual(DEFAULT_CACHE)
  })

  it('uses the remembered values, and the URL wins over them', () => {
    const saved = JSON.stringify({ diskMb: 100, distance: 6000, cells: 96 })
    expect(currentCacheSettings('', storage(saved))).toEqual({
      diskMb: 100,
      distance: 6000,
      cells: 96,
    })
    expect(currentCacheSettings('?distance=2000&cache=0', storage(saved))).toEqual({
      diskMb: 0,
      distance: 2000,
      cells: 96,
    })
  })

  it('ignores corrupt storage', () => {
    expect(currentCacheSettings('', storage('{bad'))).toEqual(DEFAULT_CACHE)
  })
})
