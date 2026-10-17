import { expect, it, vi, afterEach } from 'vitest'
import { adaptAtlasZ16, adaptAtlasZ16Instances } from '../../src/planet/atlas-z16.js'
import { planetTileGlbLayers, planetTileRevision } from '../../src/planet/contract.js'
import { mapTileSample } from '../../src/scene/mercator.js'
import { fetchTileManifest } from '../../src/render/planet/static-tiles.js'
const tile = { z: 16, x: 32447, y: 23995 }
function fixture() {
  const asset = (role: string) => ({
    role,
    url: `/api/atlas/geo/z16/rev-1/assets/32447-23995/${role}.glb`,
    bytes: 16,
    sha256: 'a'.repeat(64),
  })
  return {
    schema: 'atlas-z16-cell/1',
    tile: [16, 32447, 23995],
    origin: mapTileSample(tile, 1, 1, 2),
    axes: 'x-east,y-up,z-south',
    revision: 'rev-1',
    drivable: false,
    files: ['terrain', 'buildings', 'roads', 'decks', 'supports', 'bridgefill', 'tunnelfloor'].map(
      asset,
    ),
    instances: {
      ...asset('instances'),
      url: '/api/atlas/geo/z16/rev-1/assets/32447-23995/instances.json',
    },
  }
}
afterEach(() => vi.unstubAllGlobals())
it('loads every split driving surface despite Atlas acceptance flag and preserves proxy paths', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(fixture()))),
  )
  const m = (await fetchTileManifest(tile, { baseUrl: '/tiles-z16', pageProtocol: 'https:' }))!
  expect(m.atlasZ16?.drivable).toBe(false)
  const layers = planetTileGlbLayers(m)
  expect(layers.filter((l) => l.chartOnly).map((l) => l.name)).toEqual(['atlas-roads'])
  expect(layers.filter((l) => !l.chartOnly).map((l) => l.name)).toEqual([
    'terrain',
    'buildings-osm',
    'atlas-decks',
    'atlas-tunnelfloor',
    'atlas-supports',
    'atlas-bridgefill',
  ])
  expect(planetTileGlbLayers(m)).toHaveLength(7)
  expect(planetTileGlbLayers(m).map((l) => l.kind)).toEqual([
    'terrain',
    'buildings-osm',
    'asphalt',
    'asphalt',
    'asphalt',
    'supports',
    'supports',
  ])
  expect(m.files.terrain.url).toBe(
    '/tiles-z16/api/atlas/geo/z16/rev-1/assets/32447-23995/terrain.glb',
  )
  expect(m.instances?.url).toContain('/tiles-z16/api/')
  expect(planetTileGlbLayers(m, { buildings: false })).toHaveLength(6)
  const old = planetTileRevision(m)
  m.additionalLayers![0].file.sha256 = 'b'.repeat(64)
  expect(planetTileRevision(m)).not.toBe(old)
})
it('rejects wrong identity, origin, corrupt hashes and paths escaping the publication', () => {
  for (const mutate of [
    (m: ReturnType<typeof fixture>) => {
      m.tile[1]++
    },
    (m: ReturnType<typeof fixture>) => {
      m.origin.latitude += 0.01
    },
    (m: ReturnType<typeof fixture>) => {
      m.files[0].sha256 = 'bad'
    },
    (m: ReturnType<typeof fixture>) => {
      m.files[0].url = 'https://elsewhere/terrain.glb'
    },
    (m: ReturnType<typeof fixture>) => {
      m.files[0].url = '/api/atlas/geo/z16/rev-1/assets/32447-23995/../terrain.glb'
    },
  ]) {
    const m = fixture()
    mutate(m)
    expect(() => adaptAtlasZ16(m, tile, '/tiles')).toThrow()
  }
})

it('uses child positions for trees and lamps, never the retained parent coordinates', () => {
  const row = { type: 'tree', local: [134, null, 170], position: [-87, 4, -51] }
  expect(adaptAtlasZ16Instances([row, { position: [NaN, 0, 0] }]).instances).toEqual([
    { ...row, local: [-87, 4, -51] },
  ])
  expect(row.local).toEqual([134, null, 170])
})
it('rejects a pinned revision mismatch and tracks new UUIDs even for identical geometry', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(fixture()))),
  )
  await expect(
    fetchTileManifest(tile, {
      baseUrl: '/tiles',
      publication: { revision: 'other', manifestUrl: '/tiles/pinned' },
    }),
  ).rejects.toThrow()
  const m = adaptAtlasZ16(fixture(), tile, '/tiles')!
  const before = planetTileRevision(m)
  m.atlasZ16!.revision = 'another-job'
  expect(planetTileRevision(m)).not.toBe(before)
})
