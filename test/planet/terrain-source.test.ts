import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PACKAGES_URL,
  TERRAIN_SOURCES,
  chooseTerrainSource,
  loadTerrainSource,
  normalizeSourceUrl,
  parseStoredSource,
  parseTerrainSource,
  saveTerrainSource,
  serializeStoredSource,
  validateTerrainSource,
  withTerrainSource,
} from '../../src/planet/terrain-source.js'

describe('terrain source', () => {
  it('offers Plano, Teselas and Carpeta de paquetes in Spanish', () => {
    expect(TERRAIN_SOURCES.map((s) => [s.kind, s.label])).toEqual([
      ['flat', 'Plano'],
      ['tiles', 'Teselas'],
      ['packages', 'Carpeta de paquetes'],
    ])
  })

  it('reads the source named by the URL, packages first', () => {
    expect(parseTerrainSource('')).toBeNull()
    expect(parseTerrainSource('?quality=low')).toBeNull()
    expect(parseTerrainSource('?example=flat')).toEqual({ kind: 'flat' })
    expect(parseTerrainSource('?tiles=https://t.example/x')).toEqual({
      kind: 'tiles',
      url: 'https://t.example/x',
    })
    expect(parseTerrainSource('?terrain=/terrain/&relief=lidar')).toEqual({
      kind: 'packages',
      url: '/terrain',
      relief: 'lidar',
    })
    expect(parseTerrainSource('?z15=/t')).toMatchObject({ kind: 'packages', relief: 'engine' })
    expect(parseTerrainSource('?tiles=/a&example=flat&terrain=/p')?.kind).toBe('packages')
    expect(parseTerrainSource('?tiles=/a&example=flat')?.kind).toBe('flat')
    expect(parseTerrainSource('?terrain=%20')).toBeNull()
  })

  it('validates and normalises URLs with Spanish errors', () => {
    expect(normalizeSourceUrl(' https://t.example/a// ')).toBe('https://t.example/a')
    expect(normalizeSourceUrl('/terrain/')).toBe('/terrain')
    expect(normalizeSourceUrl('/')).toBe('/')
    expect(() => normalizeSourceUrl('  ')).toThrow(/Escribe la URL/)
    expect(() => normalizeSourceUrl('javascript:alert(1)')).toThrow(/http/)
    expect(() => normalizeSourceUrl('mis teselas')).toThrow(/http/)
    expect(validateTerrainSource({ kind: 'packages' })).toEqual({
      kind: 'packages',
      url: DEFAULT_PACKAGES_URL,
      relief: 'engine',
    })
    expect(() => validateTerrainSource({ kind: 'tiles' })).toThrow()
    expect(() => validateTerrainSource({ kind: 'nope' } as never)).toThrow(/desconocido/)
  })

  it('builds the reload query, keeping unrelated parameters', () => {
    expect(withTerrainSource('?quality=low', { kind: 'flat' })).toBe('?quality=low&example=flat')
    expect(
      withTerrainSource('?terrain=/terrain&tile=16211/12003&layers=-road', { kind: 'flat' }),
    ).toBe('?layers=-road&example=flat')
    expect(withTerrainSource('', { kind: 'tiles', url: 'https://t.example/' })).toBe(
      '?tiles=https%3A%2F%2Ft.example',
    )
    expect(withTerrainSource('?example=flat&fps=60', { kind: 'packages', relief: 'lidar' })).toBe(
      '?fps=60&terrain=%2Fterrain&relief=lidar',
    )
  })

  it('keeps the position when only the relief or URL of the same kind changes', () => {
    const next = withTerrainSource('?terrain=/terrain&tile=16217/11998&dx=5&heading=90', {
      kind: 'packages',
      url: '/terrain',
      relief: 'lidar',
    })
    const params = new URLSearchParams(next)
    expect(params.get('tile')).toBe('16217/11998')
    expect(params.get('dx')).toBe('5')
    expect(params.get('relief')).toBe('lidar')
    expect(parseTerrainSource(next)).toMatchObject({ kind: 'packages', relief: 'lidar' })
  })

  it('round-trips through the URL for every kind', () => {
    for (const source of [
      { kind: 'flat' as const },
      { kind: 'tiles' as const, url: 'https://t.example/a' },
      { kind: 'packages' as const, url: '/terrain', relief: 'engine' as const },
      { kind: 'packages' as const, url: 'https://p.example/z', relief: 'lidar' as const },
    ])
      expect(parseTerrainSource(withTerrainSource('', source))).toEqual(
        validateTerrainSource(source),
      )
  })

  it('remembers a choice and ignores broken storage', () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
    saveTerrainSource(storage, 'k', { kind: 'tiles', url: 'https://t.example/a/' })
    expect(loadTerrainSource(storage, 'k')).toEqual({ kind: 'tiles', url: 'https://t.example/a' })
    expect(parseStoredSource(serializeStoredSource({ kind: 'flat' }))).toEqual({ kind: 'flat' })
    for (const bad of [
      null,
      '',
      'x',
      '{"kind":"tiles"}',
      '{"kind":"tiles","url":"javascript:1"}',
      '5',
    ])
      expect(parseStoredSource(bad)).toBeNull()
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(loadTerrainSource(broken, 'k')).toBeNull()
    expect(() => saveTerrainSource(broken, 'k', { kind: 'flat' })).not.toThrow()
    expect(loadTerrainSource(undefined, 'k')).toBeNull()
  })

  it('chooses: URL, then remembered, then packages if available, else flat', () => {
    const tiles = { kind: 'tiles' as const, url: '/t' }
    expect(
      chooseTerrainSource({ search: '?example=flat', stored: tiles, packagesAvailable: true }),
    ).toEqual({
      source: { kind: 'flat' },
      from: 'url',
    })
    expect(chooseTerrainSource({ search: '', stored: tiles, packagesAvailable: true })).toEqual({
      source: tiles,
      from: 'remembered',
    })
    expect(chooseTerrainSource({ search: '', packagesAvailable: true })).toEqual({
      source: { kind: 'packages', url: '/terrain', relief: 'engine' },
      from: 'default',
    })
    expect(chooseTerrainSource({ search: '', packagesAvailable: false })).toEqual({
      source: { kind: 'flat' },
      from: 'default',
    })
  })

  it('does not trust a remembered default package folder that is gone, but trusts a custom one', () => {
    const gone = { kind: 'packages' as const, url: '/terrain', relief: 'engine' as const }
    expect(
      chooseTerrainSource({ search: '', stored: gone, packagesAvailable: false }).source,
    ).toEqual({
      kind: 'flat',
    })
    const custom = {
      kind: 'packages' as const,
      url: 'https://p.example/z',
      relief: 'engine' as const,
    }
    expect(
      chooseTerrainSource({ search: '', stored: custom, packagesAvailable: false }).source,
    ).toEqual(custom)
  })
})
