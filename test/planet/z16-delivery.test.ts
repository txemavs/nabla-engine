import { afterEach, expect, it, vi } from 'vitest'
import { fetchTileManifest, tileManifestUrl } from '../../src/render/planet/static-tiles.js'
import { planetTileRevision, type PlanetManifest } from '../../src/planet/contract.js'
import { mapTileBounds, mapTileId, mapTileSample } from '../../src/scene/mercator.js'

const tile = { z: 16, x: 32448, y: 23996 }
function manifest(): PlanetManifest {
  return {
    format: 'nabla-planet-tile-v1',
    generator: 'native-xyz-v2',
    geometryRevision: 'native-surfaces-v5',
    tile,
    id: mapTileId(tile),
    anchor: mapTileSample(tile, 1, 1, 2),
    bounds: mapTileBounds(tile),
    files: {
      terrain: {
        path: 'terra-16-32448-23996-202610161200.glb',
        download: 'terrain.glb',
        bytes: 123,
        sha256: 'a'.repeat(64),
      },
      'buildings-osm': {
        path: 'build-16-32448-23996-202610161200.glb',
        download: 'buildings.glb',
        bytes: 123,
        sha256: 'b'.repeat(64),
      },
    },
  }
}
afterEach(() => vi.unstubAllGlobals())
it('loads native Z16 through the same verified-manifest provider without a Z15 package', async () => {
  const data = manifest()
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))
  vi.stubGlobal('fetch', fetch)
  expect(await fetchTileManifest(tile, { baseUrl: 'https://tiles.example', atlas: {} })).toEqual(
    data,
  )
  expect(fetch.mock.calls[0][0]).toBe('https://tiles.example/z/16/32448/23996/manifest.json')
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('rejects a parent masquerading as a child instead of reinterpreting its coordinates', async () => {
  const data = manifest()
  data.anchor = mapTileSample({ z: 15, x: 16224, y: 11998 }, 1, 1, 2)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))))
  await expect(fetchTileManifest(tile, { baseUrl: 'https://tiles.example' })).rejects.toThrow(
    'invalid manifest',
  )
})
it('missing child returns unavailable, without synthesizing a tile or changing its address', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
  vi.stubGlobal('fetch', fetch)
  expect(await fetchTileManifest(tile, { baseUrl: 'https://tiles.example' })).toBeUndefined()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(tileManifestUrl(tile, 'https://tiles.example')).toContain('/z/16/')
})
it('an instances-only publication change invalidates the resident revision', () => {
  const data = manifest()
  const first = planetTileRevision(data)
  data.instances = {
    path: 'instances.json',
    download: 'instances.json',
    bytes: 10,
    sha256: 'c'.repeat(64),
  }
  const second = planetTileRevision(data)
  expect(second).not.toBe(first)
  data.instances.sha256 = 'd'.repeat(64)
  expect(planetTileRevision(data)).not.toBe(second)
})
