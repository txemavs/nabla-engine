import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCoverage,
  formatCells,
  parseTerrainConfig,
  probeTerrainFolder,
  terrainDefaults,
  startFromIndex,
  wantsTerrain,
} from '../../game/terrain.js'

describe('terrain-folder example config', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is selected by ?terrain=, ?z15= or ?example=z15 only', () => {
    expect(wantsTerrain('?terrain=/terrain')).toBe(true)
    expect(wantsTerrain('?z15=https://h.example/t')).toBe(true)
    expect(wantsTerrain('?example=z15')).toBe(true)
    expect(wantsTerrain('?example=flat')).toBe(false)
    expect(wantsTerrain('?tiles=/x')).toBe(false)
    expect(wantsTerrain('')).toBe(false)
  })

  it('requires the terrain location instead of hard-coding one', () => {
    expect(() => parseTerrainConfig('?example=z15&tile=16211/12003')).toThrow(
      /Falta el origen del terreno/,
    )
    expect(() => parseTerrainConfig('?terrain=%20')).toThrow(/Falta el origen del terreno/)
  })

  it('accepts terrain and its alias, normalising the base', () => {
    expect(parseTerrainConfig('?terrain=/terrain/&tile=16211/12003').base).toBe('/terrain')
    expect(parseTerrainConfig('?z15=https://h.example/t//&lat=43.3&lon=-1.9').base).toBe(
      'https://h.example/t',
    )
    expect(parseTerrainConfig('?terrain=/&lat=1&lon=2').base).toBe('')
  })

  it('computes the start from tile + offsets, or takes lat/lon', () => {
    const c = parseTerrainConfig('?terrain=/terrain&tile=16211/12003&dx=17.4&dz=-197.6&heading=118')
    expect(c.tile).toEqual({ z: 15, x: 16211, y: 12003 })
    expect(c.start!.latitude).toBeCloseTo(43.29719840464635 + 197.6 / 111_195, 4)
    expect(c.start!.longitude).toBeGreaterThan(-1.8951416015625)
    expect(c.scene).toMatchObject({ heading: 118, altitude: 0, vehicle: 'car' })
    const explicit = parseTerrainConfig(
      '?terrain=/t&lat=43.2954&lon=-1.8949&alt=12&vehicle=white-truck',
    )
    expect(explicit.start).toEqual({ latitude: 43.2954, longitude: -1.8949 })
    expect(explicit.tile).toEqual({ z: 15, x: 16211, y: 12003 })
    expect(explicit.scene).toMatchObject({ altitude: 12, vehicle: 'white-truck' })
  })

  it('accepts the position as ll=<lat>,<lon> like lat= and lon=, in any common format', () => {
    const want = { latitude: 43.3386, longitude: -1.7899 }
    for (const query of [
      'lat=43.3386&lon=-1.7899',
      'll=43.3386,-1.7899',
      'll=43.3386%2C-1.7899',
      'll=43.3386%2C%20-1.7899',
      'll=43.3386;-1.7899',
      'll=43.3386+-1.7899',
      'll=43%C2%B020%2719.0%22N%201%C2%B047%2723.6%22W',
    ]) {
      const c = parseTerrainConfig(`?terrain=/t&${query}`)
      expect(c.start!.latitude, query).toBeCloseTo(want.latitude, 3)
      expect(c.start!.longitude, query).toBeCloseTo(want.longitude, 3)
      expect(c.tile, query).toEqual({ z: 15, x: 16221, y: 11998 })
    }
    // The position wins over tile=/dx/dz, which only mean something without it.
    const both = parseTerrainConfig('?terrain=/t&tile=16211/12003&dx=500&ll=43.3386,-1.7899')
    expect(both.tile).toEqual({ z: 15, x: 16221, y: 11998 })
    expect(both.start).toEqual(want)
  })

  it('explains a bad ll= or a clash between ll= and lat=/lon= in Spanish', () => {
    expect(() => parseTerrainConfig('?terrain=/t&ll=hola')).toThrow(/ll debe ser <lat>,<lon>/)
    expect(() => parseTerrainConfig('?terrain=/t&ll=95,0')).toThrow(/Posición inicial no válida/)
    expect(() => parseTerrainConfig('?terrain=/t&ll=43,-1&lat=43&lon=-1')).toThrow(/no las dos/)
    expect(() => parseTerrainConfig('?terrain=/t&lat=43.3&lon=200')).toThrow(/fuera de rango/)
    expect(() => parseTerrainConfig('?terrain=/t&lat=85.5&lon=0')).toThrow(/fuera de rango/)
  })

  it('defaults to the drivable engine relief and the full photo', () => {
    expect(parseTerrainConfig('?terrain=/t&tile=16211/12003').atlas).toEqual({
      relief: 'engine',
      photo: 'full',
    })
    expect(parseTerrainConfig('?terrain=/t&tile=1/1&relief=lidar&photo=lo').atlas).toEqual({
      relief: 'lidar',
      photo: 'lo',
    })
  })

  it('explains bad input in Spanish', () => {
    expect(() => parseTerrainConfig('?terrain=/t&tile=16211/12003&relief=mesh')).toThrow(/relief/)
    expect(() => parseTerrainConfig('?terrain=/t&tile=16211/12003&photo=4k')).toThrow(/photo/)
    expect(() => parseTerrainConfig('?terrain=/t&lat=43')).toThrow(/lat y lon juntos/)
    expect(() => parseTerrainConfig('?terrain=/t&tile=abc')).toThrow(/Posición inicial no válida/)
    expect(() => parseTerrainConfig('?terrain=/t&tile=16211/12003&dx=east')).toThrow(
      /no es un número/,
    )
    expect(() => parseTerrainConfig('?terrain=/t&lat=95&lon=0')).toThrow(
      /Posición inicial no válida/,
    )
  })

  it('starts over the first listed tile when the host has an index and no start was given', async () => {
    const index = {
      tiles: [
        { z: 15, x: 16211, y: 12003 },
        { z: 15, x: 16212, y: 12003 },
      ],
    }
    vi.stubGlobal('fetch', async (url: string) =>
      url === '/terrain/index.json' ? Response.json(index) : new Response('', { status: 404 }),
    )
    expect(await fetchCoverage('/terrain')).toEqual(index.tiles)
    const config = await startFromIndex(parseTerrainConfig('?terrain=/terrain'))
    expect(config.tile).toEqual({ z: 15, x: 16211, y: 12003 })
    expect(config.start!.latitude).toBeCloseTo(43.2972, 4)
    // An explicit start never asks the host.
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    await startFromIndex(parseTerrainConfig('?terrain=/terrain&tile=16212/12003'))
    expect(spy).not.toHaveBeenCalled()
  })

  it('asks for a start when the host cannot list tiles', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    expect(await fetchCoverage('/terrain')).toBeUndefined()
    await expect(startFromIndex(parseTerrainConfig('?terrain=/terrain'))).rejects.toThrow(
      /Falta la posición inicial/,
    )
  })
})

describe('bare URL and cell streaming', () => {
  it('starts a bare URL over the default road when its cell is published', () => {
    const params = new URLSearchParams(terrainDefaults(true))
    expect(params.get('terrain')).toBe('/terrain')
    expect(params.get('tile')).toBe('16211/12003')
    expect(params.get('dx')).toBe('17.4')
    expect(params.get('dz')).toBe('-197.6')
    expect(params.get('heading')).toBe('118')
    expect(params.get('vehicle')).toBe('car')
    expect(() => parseTerrainConfig('?' + params.toString())).not.toThrow()
    expect(terrainDefaults(true, '/other').terrain).toBe('/other')
  })

  it('asks for no start when the default cell is not published', () => {
    expect(terrainDefaults(false)).toEqual({ terrain: '/terrain' })
  })

  it('probes one manifest, not an index file', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      return new Response('{}', { status: url.includes('16211/12003') ? 200 : 403 })
    })
    expect(await probeTerrainFolder('/terrain')).toBe(true)
    expect(urls).toEqual(['/terrain/z/15/16211/12003/manifest.json'])
    expect(await probeTerrainFolder('/terrain', '1/2')).toBe(false)
    vi.stubGlobal('fetch', async () => Promise.reject(new TypeError('Failed to fetch')))
    expect(await probeTerrainFolder('/terrain')).toBe(false)
  })

  it('floats the Studio monitor unless asked otherwise', () => {
    expect(parseTerrainConfig('?terrain=/t&tile=16211/12003')).toMatchObject({
      playerMode: 'hover',
    })
    expect(parseTerrainConfig('?terrain=/t&tile=16211/12003&player=walk')).toMatchObject({
      playerMode: 'walk',
    })
    expect(() => parseTerrainConfig('?terrain=/t&player=fly')).toThrow(/player/)
  })

  it('shows the loaded cells in Spanish', () => {
    expect(formatCells({ loaded: 12, missing: 0, pending: 0 })).toBe('Celdas: 12 cargadas')
    expect(formatCells({ loaded: 1, missing: 1, pending: 0 })).toBe('Celdas: 1 cargada · 1 falta')
    expect(formatCells({ loaded: 12, missing: 5, pending: 3 })).toBe(
      'Celdas: 12 cargadas · 5 faltan · cargando 3…',
    )
  })
})

describe('layer selector start state', () => {
  const store = (value: string | null) => ({ getItem: () => value, setItem: () => {} })
  it('prefers ?layers= over the stored choice, and falls back to it', async () => {
    const { initialHiddenLayers } = await import('../../game/layers-ui.js')
    expect(initialHiddenLayers('?layers=-photo', store('-road'))).toEqual(['photo'])
    expect(initialHiddenLayers('?layers=', store('-road'))).toEqual([])
    expect(initialHiddenLayers('', store('-road'))).toEqual(['road'])
    expect(initialHiddenLayers('', store(null))).toEqual([])
  })
})
