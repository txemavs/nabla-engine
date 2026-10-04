import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroundMissingError } from '../../src/runtime/ground.js'
import {
  describeStartError,
  nearestCell,
  searchForCell,
  searchForDefaultStart,
  startError,
} from '../../game/start-error.js'
import { resolveEntry } from '../../game/entry.js'

const hole = new GroundMissingError({ z: 15, x: 16223, y: 19997 })
const near = new GroundMissingError({ z: 15, x: 16223, y: 11990 })
const cells = [
  { z: 15, x: 16223, y: 11997 },
  { z: 15, x: 16211, y: 12003 },
  { z: 15, x: 16224, y: 11999 },
]

describe('spawn over a hole', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('names the missing cell in Spanish', () => {
    const text = describeStartError(hole)
    expect(text).toContain('No hay terreno en la celda 16223/19997')
    expect(text).not.toMatch(/Ground unavailable/)
  })

  it('translates other ground failures instead of showing English', () => {
    expect(describeStartError(new Error('Ground unavailable: HTTP 403'))).toBe(
      'No se pudo cargar el terreno bajo el punto de inicio. HTTP 403',
    )
    expect(describeStartError(new Error('Vehículo desconocido: x'))).toBe('Vehículo desconocido: x')
  })

  it('picks the nearest listed cell', () => {
    expect(nearestCell({ z: 15, x: 16223, y: 11990 }, cells)).toEqual(cells[0])
    expect(nearestCell({ z: 15, x: 16212, y: 12010 }, cells)).toEqual(cells[1])
    expect(nearestCell({ z: 15, x: 1, y: 1 }, [])).toBeUndefined()
  })

  it('moves the URL onto a cell and drops the old position', () => {
    const next = new URLSearchParams(
      searchForCell(
        '?terrain=/terrain&tile=16223/19997&dx=5&dz=6&lat=1&lon=2&quality=low',
        cells[0],
      ),
    )
    expect(next.get('tile')).toBe('16223/11997')
    expect([next.get('dx'), next.get('dz'), next.get('lat'), next.get('lon')]).toEqual([
      null,
      null,
      null,
      null,
    ])
    expect(next.get('terrain')).toBe('/terrain')
    expect(next.get('quality')).toBe('low')
    const start = new URLSearchParams(
      searchForDefaultStart('?terrain=/t&tile=1/2&lat=3&lon=4', '/t'),
    )
    expect([start.get('tile'), start.get('dx'), start.get('lat')]).toEqual([
      '16211/12003',
      '17.4',
      null,
    ])
  })

  it('offers the nearest available cell from the optional index', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url === '/terrain/index.json'
        ? Response.json({ tiles: cells })
        : new Response('', { status: 404 }),
    )
    const result = await startError(near, '/terrain', '?terrain=/terrain&tile=16223/11990')
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0].label).toBe('Ir a la celda disponible más cercana (16223/11997)')
    expect(new URLSearchParams(result.actions[0].search).get('tile')).toBe('16223/11997')
  })

  it('without an index offers the default start when it is published, else nothing', async () => {
    vi.stubGlobal(
      'fetch',
      async (url: string) =>
        new Response('{}', { status: url.includes('16211/12003') ? 200 : 404 }),
    )
    const result = await startError(hole, '/terrain', '?terrain=/terrain&tile=16223/19997')
    expect(result.actions.map((a) => a.label)).toEqual(['Ir al inicio por defecto'])
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    expect((await startError(hole, '/terrain', '?terrain=/terrain')).actions).toEqual([])
    // Other errors never offer a jump.
    expect((await startError(new Error('x'), '/terrain', '')).actions).toEqual([])
  })

  it('never remembers a bad start: only the source choice is stored, never a position', async () => {
    const writes: string[] = []
    const storage = {
      getItem: () => null,
      setItem: (k: string, v: string) => void writes.push(k + v),
    }
    const entry = await resolveEntry(
      '?terrain=/terrain&tile=16223/19997&dx=1&dz=2',
      storage,
      async () => true,
    )
    expect(entry.mode).toBe('terrain')
    expect(writes).toEqual([])
  })
})
