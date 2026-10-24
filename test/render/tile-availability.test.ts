import { afterEach, expect, it, vi } from 'vitest'
import {
  parseTileAvailability,
  TileAvailability,
} from '../../src/render/planet/tile-availability.js'
import { PlanetWorld } from '../../src/render/planet/world.js'
import { MissingTiles } from '../../src/planet/missing-tiles.js'
import { mapTileId } from '../../src/scene/mercator.js'

const tile = { z: 15, x: 16223, y: 11999 }
const absent = { ...tile, x: 16225 }
const snapshot = (cells = [[tile.x, tile.y]], revision = '1') => ({
  schema: 'nabla-tile-availability/1',
  complete: true,
  revision,
  zooms: { '15': cells },
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('validates the complete snapshot and rejects malformed coordinates or incomplete coverage', () => {
  expect(parseTileAvailability(snapshot()).tiles.size).toBe(1)
  for (const data of [
    snapshot([[32768, 0]]),
    snapshot([[1.5, 2]]),
    { ...snapshot(), complete: false },
    { ...snapshot(), schema: 'other' },
  ]) {
    expect(() => parseTileAvailability(data)).toThrow()
  }
})

it('deduplicates polling, scopes zooms and discovers newly published cells after refresh', async () => {
  let now = 1000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(snapshot()))
    .mockResolvedValueOnce(
      Response.json(
        snapshot(
          [
            [tile.x, tile.y],
            [absent.x, absent.y],
          ],
          '2',
        ),
      ),
    )
    .mockResolvedValueOnce(new Response('', { status: 503 }))
  vi.stubGlobal('fetch', fetcher)
  const published = vi.fn()
  const index = new TileAvailability('/tiles/', new AbortController().signal, published)
  await Promise.all([index.poll(), index.poll()])
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0][0]).toBe('/tiles/index.json')
  expect(index.has(tile)).toBe(true)
  expect(index.has(absent)).toBe(false)
  expect(index.has({ ...tile, z: 16 })).toBeUndefined()
  now += 60_000
  await index.poll()
  expect(index.has(absent)).toBe(true)
  expect(published.mock.calls.map((c) => c[0])).toEqual([tile, absent])
  now += 60_000
  await index.poll()
  expect(index.has(tile)).toBe(true)
})

it.each([403, 404, 500, 'invalid', 'network'])(
  'uses legacy discovery when index fails: %s',
  async (failure) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (failure === 'network') throw new Error('offline')
        return typeof failure === 'number'
          ? new Response('', { status: failure })
          : Response.json({})
      }),
    )
    const index = new TileAvailability('/tiles', new AbortController().signal, vi.fn())
    await index.poll()
    expect(index.has(tile)).toBeUndefined()
  },
)

function worldHarness() {
  const world = Object.create(PlanetWorld.prototype) as any
  Object.assign(world, {
    base: '/tiles',
    sourceOptions: {},
    discoveryMode: 'static',
    wanted: [absent, tile],
    tileBases: new Map(),
    availability: new Map(),
    controller: new AbortController(),
    next: 0,
    missing: new MissingTiles(),
    failedManifests: new Map(),
    ready: new Map(),
    resident: new Map(),
    access: true,
    discoveryOffset: 0,
    pump: vi.fn(),
    changed: vi.fn(),
    discoverStatic: vi.fn(),
  })
  return world
}

it('revalidates even when every candidate is absent and schedules newly published terrain', async () => {
  let now = 1000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(snapshot([])))
    .mockResolvedValueOnce(Response.json(snapshot([[tile.x, tile.y]], '2')))
  vi.stubGlobal('fetch', fetcher)
  const world = worldHarness()
  await world.discover()
  expect(world.discoverStatic).not.toHaveBeenCalled()
  now += 60_000
  await world.discover()
  expect(world.discoverStatic).toHaveBeenCalledWith([tile])
})

it('does not request an index when explicitly disabled, and isolates alternate tile sources', async () => {
  const fetcher = vi.fn(async (url: string) =>
    Response.json(url.startsWith('/alternate/') ? snapshot([[absent.x, absent.y]]) : snapshot([])),
  )
  vi.stubGlobal('fetch', fetcher)
  const disabled = worldHarness()
  disabled.sourceOptions.availabilityIndex = false
  await disabled.discover()
  expect(fetcher).not.toHaveBeenCalled()
  expect(disabled.discoverStatic).toHaveBeenCalledWith([absent, tile])
  const world = worldHarness()
  world.tileBases.set(mapTileId(absent), '/alternate')
  await world.discover()
  expect(world.discoverStatic).toHaveBeenCalledWith([absent])
})

it('filters absent cells before batching and clears persisted misses for published cells', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(snapshot())),
  )
  const world = worldHarness()
  world.missing.record(tile, 403)
  await world.discover()
  expect(world.discoverStatic).toHaveBeenCalledWith([tile])
  expect(world.missing.has(tile)).toBe(false)
  expect(world.knownMissing(absent)).toBe(true)
  expect(world.missing.has(absent)).toBe(false) // No invented HTTP errors.
})

it('keeps all candidates without an index and lets live publications override stale coverage', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 404 })),
  )
  const world = worldHarness()
  await world.discover()
  expect(world.discoverStatic).toHaveBeenCalledWith([absent, tile])
  const live = worldHarness()
  live.updates = {
    poll: vi.fn(),
    get: (t: typeof tile) => (t.x === absent.x ? { revision: 'new' } : undefined),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(snapshot())),
  )
  await live.discover()
  expect(live.discoverStatic).toHaveBeenCalledWith([absent, tile])
})
