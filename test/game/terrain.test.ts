import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCoverage,
  parseTerrainConfig,
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
