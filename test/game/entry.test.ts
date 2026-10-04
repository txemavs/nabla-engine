import { describe, expect, it } from 'vitest'
import { resolveEntry } from '../../game/entry.js'
import { suggestedTilesUrl } from '../../game/terrain-selector.js'

const index = [
  { z: 15, x: 16211, y: 12003 },
  { z: 15, x: 16212, y: 12003 },
]
const store = (value: string | null) => ({ getItem: () => value, setItem: () => {} })
const withIndex = async () => index
const noIndex = async () => undefined

describe('entry point', () => {
  it('keeps every explicit URL as it is', async () => {
    expect(await resolveEntry('?terrain=/t&tile=1/2', store(null), withIndex)).toEqual({
      mode: 'terrain',
      search: '?terrain=/t&tile=1/2',
    })
    expect(
      await resolveEntry('?example=flat', store('{"kind":"tiles","url":"/x"}'), withIndex),
    ).toEqual({
      mode: 'drive',
      search: '?example=flat',
    })
    expect(await resolveEntry('?tiles=/x', store(null), withIndex)).toEqual({
      mode: 'drive',
      search: '?tiles=/x',
    })
    expect((await resolveEntry('?static=false', store(null), withIndex)).mode).toBe('drive')
  })

  it('plays the package folder on a bare URL when its index answers', async () => {
    const entry = await resolveEntry('', store(null), withIndex)
    expect(entry.mode).toBe('terrain')
    const params = new URLSearchParams(entry.search)
    expect(params.get('terrain')).toBe('/terrain')
    expect(params.get('tile')).toBe('16211/12003')
    expect(params.get('heading')).toBe('118')
  })

  it('falls back to the flat tile when there is no index and nothing is remembered', async () => {
    expect(await resolveEntry('', store(null), noIndex)).toEqual({
      mode: 'drive',
      search: '?example=flat',
    })
    expect(await resolveEntry('?quality=low', store(null), noIndex)).toEqual({
      mode: 'drive',
      search: '?quality=low&example=flat',
    })
  })

  it('uses the remembered choice on a bare URL', async () => {
    expect(await resolveEntry('', store('{"kind":"flat"}'), withIndex)).toEqual({
      mode: 'drive',
      search: '?example=flat',
    })
    expect(
      await resolveEntry('', store('{"kind":"tiles","url":"https://t.example/a/"}'), withIndex),
    ).toEqual({ mode: 'drive', search: '?tiles=https%3A%2F%2Ft.example%2Fa' })
    const lidar = await resolveEntry(
      '?quality=low',
      store('{"kind":"packages","url":"/terrain","relief":"lidar"}'),
      withIndex,
    )
    const params = new URLSearchParams(lidar.search)
    expect(lidar.mode).toBe('terrain')
    expect([params.get('relief'), params.get('quality'), params.get('tile')]).toEqual([
      'lidar',
      'low',
      '16211/12003',
    ])
  })

  it('ignores a remembered package folder that no longer answers, and unreadable storage', async () => {
    expect((await resolveEntry('', store('{"kind":"packages"}'), noIndex)).search).toBe(
      '?example=flat',
    )
    expect((await resolveEntry('', store('{not json'), noIndex)).search).toBe('?example=flat')
    expect((await resolveEntry('', undefined, withIndex)).mode).toBe('terrain')
  })

  it('starts the package folder over its first cell when the default one is not in it', async () => {
    const entry = await resolveEntry('', store(null), async () => [{ z: 15, x: 5, y: 6 }])
    expect(new URLSearchParams(entry.search).has('tile')).toBe(false)
    expect(entry.mode).toBe('terrain')
  })
})

describe('tile URL suggestion', () => {
  it('prefers the active URL, then the remembered one, then the configured default', () => {
    const active = { kind: 'tiles' as const, url: '/a' }
    const stored = { kind: 'tiles' as const, url: '/b' }
    expect(suggestedTilesUrl(active, stored, '/c')).toBe('/a')
    expect(suggestedTilesUrl({ kind: 'flat' }, stored, '/c')).toBe('/b')
    expect(suggestedTilesUrl(null, { kind: 'flat' }, '/c')).toBe('/c')
    expect(suggestedTilesUrl(null, null, '')).toBe('')
  })
})
