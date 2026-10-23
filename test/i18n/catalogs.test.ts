import { describe, expect, it } from 'vitest'
import { catalogGaps, ENGINE_CATALOGS, localeFromSearch, translate } from '../../src/i18n/index.js'

describe('engine i18n catalogs', () => {
  it('has every key in en, es and eu, non-empty and with the same {params}', () => {
    expect(Object.keys(ENGINE_CATALOGS.en).length).toBeGreaterThan(300)
    expect(catalogGaps(ENGINE_CATALOGS)).toEqual([])
  })

  it('reports a missing key, an extra key and a param mismatch', () => {
    const gaps = catalogGaps({
      en: { a: 'A {n}', b: 'B' },
      es: { a: 'A', b: 'B' },
      eu: { a: 'A {n}', c: 'C' },
    })
    expect(gaps).toEqual(['es: params of a', 'eu: missing b', 'eu: extra c'])
  })

  it('reads the locale from ?locale= and defaults to English', () => {
    expect(localeFromSearch('?locale=es')).toBe('es')
    expect(localeFromSearch('?locale=eu')).toBe('eu')
    expect(localeFromSearch('?locale=fr')).toBe('en')
    expect(localeFromSearch('')).toBe('en')
  })

  it('falls back to English, then to the key, and fills params', () => {
    const catalogs = { en: { a: 'Hi {name}' }, es: {}, eu: {} }
    expect(translate(catalogs, 'eu', 'a', { name: 'Txema' })).toBe('Hi Txema')
    expect(translate(catalogs, 'es', 'missing')).toBe('missing')
  })
})
