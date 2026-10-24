import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { fetchTileManifest } from '../../src/render/planet/static-tiles.js'

// Exact HTTP response bytes; refresh together with provenance.json, never reformat packages.
const root = new URL('./fixtures/atlas-publication-2026-10-23/', import.meta.url)
afterEach(() => vi.unstubAllGlobals())

it.each([16223, 16224])(
  'loads the published Z15 contract for %s/11999 through the current consumer',
  async (x) => {
    const dir = new URL(`${x}-11999/`, root)
    const manifestBytes = readFileSync(new URL('manifest.json', dir))
    const original = JSON.parse(manifestBytes.toString())
    const packageBytes = readFileSync(new URL(original.z15Package.file, dir))
    const base = '/tiles'
    const cell = `${base}/z/15/${x}/11999/`
    const fetch = vi.fn(async (url: string) => {
      if (url === `${cell}manifest.json`) return new Response(manifestBytes)
      if (url === `${cell}${original.z15Package.file}`) return new Response(packageBytes)
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetch)
    const result = await fetchTileManifest(
      { z: 15, x, y: 11999 },
      {
        baseUrl: base,
        missingStatuses: [403, 404],
        atlas: { photo: 'full' },
      },
    )
    expect(result?.tile).toEqual(original.tile)
    // Published v2+ cells use LiDAR ground even when the caller does not request relief.
    const lidar = JSON.parse(packageBytes.toString()).files.find(
      (file: { role: string }) => file.role === 'terrain.lidar',
    )
    expect(original.cellVersion).toBe(4)
    expect(result?.files.terrain).toMatchObject({
      path: lidar.path,
      bytes: lidar.bytes,
      sha256: lidar.sha256,
    })
    expect(result?.photo).toBeDefined()
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${cell}manifest.json`,
      `${cell}${original.z15Package.file}`,
    ])
  },
)

it('distinguishes a missing entry manifest from a broken published package reference', async () => {
  const tile = { z: 15, x: 16223, y: 11999 }
  const options = { baseUrl: '/tiles', missingStatuses: [403, 404], atlas: {} }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 403 })),
  )
  await expect(fetchTileManifest(tile, options)).resolves.toBeUndefined()
  const bytes = readFileSync(new URL('16223-11999/manifest.json', root))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/manifest.json') ? new Response(bytes) : new Response('', { status: 403 }),
    ),
  )
  await expect(fetchTileManifest(tile, options)).rejects.toMatchObject({
    kind: 'http',
    status: 403,
  })
})
