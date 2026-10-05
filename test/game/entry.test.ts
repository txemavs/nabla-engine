import { describe, expect, it } from 'vitest'
import { resolveEntry } from '../../game/entry.js'
import { DEFAULT_TILES_URL } from '../../src/planet/terrain-source.js'
import { suggestedTilesUrl } from '../../game/terrain-selector.js'

const store = (value: string | null) => ({ getItem: () => value, setItem: () => {} })
const published = async () => true
const absent = async () => false

describe('entry point', () => {
  it('keeps every explicit URL as it is', async () => {
    expect(await resolveEntry('?terrain=/t&tile=1/2', store(null), published)).toEqual({
      mode: 'terrain',
      search: '?terrain=/t&tile=1/2',
    })
    expect(
      await resolveEntry('?example=flat', store('{"kind":"tiles","url":"/x"}'), published),
    ).toEqual({
      mode: 'drive',
      search: '?example=flat',
    })
    expect(await resolveEntry('?tiles=/x', store(null), published)).toEqual({
      mode: 'drive',
      search: '?tiles=/x',
    })
    expect((await resolveEntry('?static=false', store(null), published)).mode).toBe('drive')
  })

  it('plays the package folder on a bare URL when it publishes the default start cell', async () => {
    const entry = await resolveEntry('', store(null), published)
    expect(entry.mode).toBe('terrain')
    const params = new URLSearchParams(entry.search)
    expect(params.get('terrain')).toBe('/terrain')
    expect(params.get('tile')).toBe('16211/12003')
    expect(params.get('heading')).toBe('118')
  })

  it('falls back to the flat tile when the folder lacks the default cell and nothing is remembered', async () => {
    expect(await resolveEntry('', store(null), absent)).toEqual({
      mode: 'drive',
      search: '?example=flat',
    })
    expect(await resolveEntry('?quality=low', store(null), absent)).toEqual({
      mode: 'drive',
      search: '?quality=low&example=flat',
    })
  })

  it('keeps a position given on a bare URL (lat/lon, ll, tile) instead of the default road', async () => {
    for (const search of ['?lat=43.3386&lon=-1.7899', '?ll=43.3386,-1.7899', '?tile=16221/11998']) {
      const entry = await resolveEntry(search, store(null), published)
      expect(entry.mode, search).toBe('terrain')
      const params = new URLSearchParams(entry.search)
      expect(params.get('terrain')).toBe('/terrain')
      for (const key of ['dx', 'dz', 'heading']) expect(params.has(key), key).toBe(false)
      expect(params.get('tile') ?? params.get('ll') ?? params.get('lat')).toBeTruthy()
      expect(params.get('tile')).toBe(search.includes('tile') ? '16221/11998' : null)
    }
    // Other options alone still start on the default road.
    expect(
      new URLSearchParams((await resolveEntry('?heading=10', store(null), published)).search).get(
        'tile',
      ),
    ).toBe('16211/12003')
  })

  it('uses the remembered choice on a bare URL', async () => {
    expect(await resolveEntry('', store('{"kind":"flat"}'), published)).toEqual({
      mode: 'drive',
      search: '?example=flat',
    })
    expect(
      await resolveEntry('', store('{"kind":"tiles","url":"https://t.example/a/"}'), published),
    ).toEqual({ mode: 'drive', search: '?tiles=https%3A%2F%2Ft.example%2Fa' })
    const lidar = await resolveEntry(
      '?quality=low',
      store('{"kind":"packages","url":"/terrain","relief":"lidar"}'),
      published,
    )
    const params = new URLSearchParams(lidar.search)
    expect(lidar.mode).toBe('terrain')
    expect([params.get('relief'), params.get('quality'), params.get('tile')]).toEqual([
      'lidar',
      'low',
      '16211/12003',
    ])
  })

  it('ignores a remembered package folder that does not publish the start cell, and unreadable storage', async () => {
    expect((await resolveEntry('', store('{"kind":"packages"}'), absent)).search).toBe(
      '?example=flat',
    )
    expect((await resolveEntry('', store('{not json'), absent)).search).toBe('?example=flat')
    expect((await resolveEntry('', undefined, published)).mode).toBe('terrain')
  })
})

describe('tile URL suggestion', () => {
  it('prefers the active URL, then the remembered one, then the configured default', () => {
    const active = { kind: 'tiles' as const, url: '/a' }
    const stored = { kind: 'tiles' as const, url: '/b' }
    expect(suggestedTilesUrl(active, stored, '/c')).toBe('/a')
    expect(suggestedTilesUrl({ kind: 'flat' }, stored, '/c')).toBe('/b')
    expect(suggestedTilesUrl(null, { kind: 'flat' }, '/c')).toBe('/c')
    expect(suggestedTilesUrl(null, null, DEFAULT_TILES_URL)).toBe(
      'https://atlas.chained.world/euskadi/terraform',
    )
  })
})
