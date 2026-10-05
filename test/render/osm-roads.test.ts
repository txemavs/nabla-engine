import { gzipSync } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import { OSM_CELL_FORMAT } from '../../src/planet/osm-snapshot.js'
import { fetchOsmSnapshot } from '../../src/render/planet/osm-roads.js'
import { gunzipText } from '../../src/util/gzip.js'
import { sha256 } from '../../src/util/sha256.js'

const snapshot = {
  format: OSM_CELL_FORMAT,
  roads: {
    elements: [
      {
        type: 'way',
        id: 1,
        tags: { highway: 'primary', name: 'Nafarroa hiribidea' },
        geometry: [
          { lat: 43.33, lon: -1.79 },
          { lat: 43.331, lon: -1.789 },
        ],
      },
    ],
  },
}

function gzipBytes(value: string) {
  const gz = gzipSync(value)
  return gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength)
}

afterEach(() => vi.unstubAllGlobals())

it('gunzips an Atlas osm.snapshot without talking to Overpass', async () => {
  const raw = JSON.stringify(snapshot)
  const bytes = gzipBytes(raw)
  expect(await gunzipText(bytes)).toBe(raw)
  const file = {
    path: 'osm-test.json.gz',
    download: 'osm-test.json.gz',
    bytes: bytes.byteLength,
    sha256: await sha256(bytes),
  }
  vi.stubGlobal('fetch', async (url: string) => {
    expect(url).toContain('/z/15/16222/11998/osm-test.json.gz')
    expect(url).not.toMatch(/overpass/i)
    return new Response(bytes)
  })
  await expect(
    fetchOsmSnapshot('https://tiles.example/z/15/16222/11998/osm-test.json.gz', file),
  ).resolves.toEqual(snapshot)
})
