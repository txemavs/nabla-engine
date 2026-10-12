import { afterEach, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { AssetPack } from '../src/render/entity/asset-pack.js'

afterEach(() => vi.unstubAllGlobals())

function fixture() {
  const source = new TextEncoder().encode('authored GLB bytes and pivots')
  const compressed = gzipSync(source)
  const entry = {
    offset: 19,
    length: compressed.length,
    decodedLength: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
  }
  const index = {
    version: 1,
    url: '/packs/assets.hash.pak',
    size: 19 + compressed.length,
    entries: { '/library/test.glb': entry },
  }
  vi.stubGlobal('location', { origin: 'https://game.test' })
  vi.stubGlobal('caches', undefined)
  return { source, compressed, entry, index }
}

it.each([true, false])(
  'restores verified bytes with Web Crypto available: %s',
  async (available) => {
    const { source, compressed, entry, index } = fixture()
    if (!available) vi.stubGlobal('crypto', {})
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(index))
      .mockResolvedValueOnce(
        new Response(compressed, {
          status: 206,
          headers: {
            'Content-Range': `bytes 19-${index.size - 1}/${index.size}`,
          },
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    expect(new Uint8Array((await new AssetPack().read('/library/test.glb'))!)).toEqual(source)
    expect(fetcher.mock.calls[1][1].headers.Range).toBe(`bytes=19-${19 + entry.length - 1}`)
    expect(fetcher.mock.calls[1][1].cache).toBe('no-store')
  },
)

it('falls back without consuming a whole-pack response on servers without ranges', async () => {
  const { index } = fixture()
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(index))
      .mockResolvedValueOnce(new Response('whole archive')),
  )
  expect(await new AssetPack().read('/library/test.glb')).toBeNull()
})

it('rejects a corrupt decoded block', async () => {
  const { compressed, index } = fixture()
  index.entries['/library/test.glb'].sha256 = 'bad'
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(index))
      .mockResolvedValueOnce(
        new Response(compressed, {
          status: 206,
          headers: {
            'Content-Range': `bytes 19-${index.size - 1}/${index.size}`,
          },
        }),
      ),
  )
  await expect(new AssetPack().read('/library/test.glb')).rejects.toThrow('checksum')
})

it('supports missing packs and leaves custom URLs alone', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
  vi.stubGlobal('fetch', fetcher)
  const pack = new AssetPack()
  expect(await pack.read('/custom/car.glb')).toBeNull()
  expect(fetcher).not.toHaveBeenCalled()
  expect(await pack.read('/library/test.glb')).toBeNull()
  expect(await pack.read('/library/other.glb')).toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('uses persistent cached blocks without downloading the pack', async () => {
  const { index, source } = fixture()
  vi.stubGlobal('caches', { open: async () => ({ match: async () => new Response(source) }) })
  const fetcher = vi.fn().mockResolvedValue(Response.json(index))
  vi.stubGlobal('fetch', fetcher)
  expect(new Uint8Array((await new AssetPack().read('/library/test.glb'))!)).toEqual(source)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
