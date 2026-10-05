import { describe, expect, it } from 'vitest'
import { jumpToPosition } from '../../game/position.js'
import { parseTerrainConfig } from '../../game/terrain.js'

describe('Ir a latitud, longitud', () => {
  it('turns a pasted Google Maps position into a URL that keeps the other options', () => {
    const jump = jumpToPosition(
      '?terrain=/terrain&tile=16211/12003&dx=17.4&dz=-197.6&heading=118&quality=low&layers=a',
      '43.3386, -1.7899',
    )
    const params = new URLSearchParams(jump.search)
    expect(params.get('lat')).toBe('43.3386')
    expect(params.get('lon')).toBe('-1.7899')
    for (const key of ['tile', 'dx', 'dz', 'll']) expect(params.has(key), key).toBe(false)
    expect(params.get('terrain')).toBe('/terrain')
    expect(params.get('heading')).toBe('118')
    expect(params.get('quality')).toBe('low')
    // The page can start from it: Irun lies in cell 16221/11998.
    expect(parseTerrainConfig(jump.search).tile).toEqual({ z: 15, x: 16221, y: 11998 })
  })

  it('replaces a previous jump', () => {
    const first = jumpToPosition('?terrain=/terrain&lat=1&lon=2&alt=5', '43.3386 -1.7899')
    const again = jumpToPosition(first.search!, '43.3 N, 1.9 W')
    const params = new URLSearchParams(again.search)
    expect([params.get('lat'), params.get('lon'), params.has('alt')]).toEqual([
      '43.3',
      '-1.9',
      false,
    ])
  })

  it('explains in Spanish what it did not understand, without a URL', () => {
    expect(jumpToPosition('?terrain=/t', '')).toMatchObject({
      error: expect.stringMatching(/Escribe una posición/),
    })
    for (const text of ['hola', '43.3386', '95, 10', '43, 200']) {
      const jump = jumpToPosition('?terrain=/t', text)
      expect(jump.search, text).toBeUndefined()
      expect(jump.error, text).toMatch(/No entiendo esa posición/)
    }
  })
})
