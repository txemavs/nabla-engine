import { afterEach, expect, it, vi } from 'vitest'
import { fetchTileManifest } from '../../src/render/planet/static-tiles.js'

afterEach(() => vi.unstubAllGlobals())

const tile = { z: 15, x: 16211, y: 12001 }

it('tries manifest files in order and falls back when one is missing', async () => {
  const urls: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url)
    return new Response('', { status: url.endsWith('manifest.compressed.json') ? 403 : 404 })
  })
  let missing = 0
  const manifest = await fetchTileManifest(tile, {
    baseUrl: 'https://tiles.test',
    missingStatuses: [403, 404],
    manifestFiles: ['manifest.compressed.json', 'manifest.json'],
    onMissing: () => missing++,
  })
  expect(manifest).toBeUndefined()
  expect(urls).toEqual([
    'https://tiles.test/z/15/16211/12001/manifest.compressed.json',
    'https://tiles.test/z/15/16211/12001/manifest.json',
  ])
  expect(missing).toBe(1)
})
