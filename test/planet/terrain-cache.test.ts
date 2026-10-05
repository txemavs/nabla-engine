import { describe, expect, it } from 'vitest'
import {
  CACHE_BUDGETS_MB,
  formatBudget,
  formatCacheUsage,
  formatDistance,
  normalizeCacheSettings,
  parseCacheParams,
  parseStoredCache,
  resolveCacheSettings,
  serializeStoredCache,
} from '../../src/planet/terrain-cache.js'

describe('terrain cache settings', () => {
  it("offers Studio's disk budgets, with 0 meaning off", () => {
    expect(CACHE_BUDGETS_MB[0]).toBe(0)
    expect(CACHE_BUDGETS_MB).toContain(100)
    expect(formatBudget(0)).toBe('Desactivada')
    expect(formatBudget(500)).toBe('500 MB')
    expect(formatBudget(2000)).toBe('2 GB')
    expect(formatDistance(4000)).toBe('4 km')
    expect(formatDistance(500)).toBe('500 m')
  })

  it('keeps valid fields and drops the rest', () => {
    expect(normalizeCacheSettings({ diskMb: 500, cells: 64, distance: 4000 })).toEqual({
      diskMb: 500,
      cells: 64,
      distance: 4000,
    })
    expect(normalizeCacheSettings({ diskMb: -1, cells: 3, distance: 1e9 })).toEqual({})
    expect(normalizeCacheSettings({ cells: 12.5, diskMb: Number.NaN })).toEqual({})
    expect(normalizeCacheSettings('x')).toEqual({})
    expect(normalizeCacheSettings({ diskMb: 0 })).toEqual({ diskMb: 0 })
  })

  it('reads URL parameters and ignores bad ones', () => {
    expect(parseCacheParams('?cache=250&memory=96&distance=6000')).toEqual({
      diskMb: 250,
      cells: 96,
      distance: 6000,
    })
    expect(parseCacheParams('?cache=lots&memory=&distance=10')).toEqual({})
    expect(parseCacheParams('')).toEqual({})
  })

  it('round-trips through storage and survives corrupt storage', () => {
    const settings = { diskMb: 1000, distance: 2000 }
    expect(parseStoredCache(serializeStoredCache(settings))).toEqual(settings)
    expect(parseStoredCache('{nope')).toEqual({})
    expect(parseStoredCache(null)).toEqual({})
  })

  it('lets the URL beat the remembered value field by field, over defaults', () => {
    expect(
      resolveCacheSettings(
        '?distance=1000',
        { diskMb: 50, distance: 6000 },
        { diskMb: 1000, cells: 64 },
      ),
    ).toEqual({ diskMb: 50, cells: 64, distance: 1000 })
  })

  it('describes the disk cache in Spanish', () => {
    expect(formatCacheUsage({ bytes: 123_400_000, entries: 12, budget: 1_000_000_000 })).toBe(
      '123.4 / 1000 MB · 12 archivos',
    )
  })
})
