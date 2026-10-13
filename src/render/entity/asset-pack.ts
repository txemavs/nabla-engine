import { sha256 } from '../../util/sha256.js'

interface PackEntry {
  offset: number
  length: number
  decodedLength: number
  sha256: string
}
interface PackIndex {
  version: number
  url: string
  size: number
  entries: Record<string, PackEntry>
}

/** Fetch only requested blocks; cache decoded, verified assets across visits. */
export class AssetPack {
  private index?: Promise<PackIndex | null>
  constructor(private readonly indexUrl = '/packs/index.json') {}

  async read(url: string): Promise<ArrayBuffer | null> {
    if (!url.startsWith('/library/') || !url.endsWith('.glb')) return null
    this.index ??= fetch(this.indexUrl, { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) return null
        const index = (await response.json()) as PackIndex
        return index.version === 1 ? index : null
      })
      .catch(() => null)
    const index = await this.index
    const entry = index?.entries[url]
    if (!index || !entry) return null
    if (
      !Number.isSafeInteger(entry.offset) ||
      entry.offset < 0 ||
      !Number.isSafeInteger(entry.length) ||
      entry.length <= 0 ||
      entry.offset + entry.length > index.size
    )
      throw new Error('Invalid asset pack block')
    const key = new URL(`/packs/cache/${entry.sha256}`, location.origin).href
    // Storage denial/quota exhaustion must never prevent playing.
    const cache = await globalThis.caches?.open('nabla-assets-v1').catch(() => undefined)
    const cached = await cache?.match(key).catch(() => undefined)
    if (cached) return cached.arrayBuffer()
    const response = await fetch(index.url, {
      // Chromium's HTTP cache can reject concurrent partial responses for one URL.
      // Persistent caching belongs to the verified, complete per-model responses above.
      cache: 'no-store',
      headers: { Range: `bytes=${entry.offset}-${entry.offset + entry.length - 1}` },
    })
    // A server without byte ranges would download the entire library per model.
    // Cancel that body and use the ordinary URL instead.
    if (response.status !== 206) {
      await response.body?.cancel()
      return null
    }
    if (
      response.headers.get('Content-Range') !==
      `bytes ${entry.offset}-${entry.offset + entry.length - 1}/${index.size}`
    ) {
      await response.body?.cancel()
      throw new Error('Invalid asset pack range')
    }
    const compressed = await response.arrayBuffer()
    if (compressed.byteLength !== entry.length) throw new Error('Truncated asset pack block')
    const buffer = await new Response(
      new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer()
    if (buffer.byteLength !== entry.decodedLength) throw new Error('Invalid asset size')
    const hash = await sha256(buffer)
    if (hash !== entry.sha256) throw new Error('Asset pack checksum mismatch')
    await cache?.put(key, new Response(buffer)).catch(() => undefined)
    return buffer
  }
}
