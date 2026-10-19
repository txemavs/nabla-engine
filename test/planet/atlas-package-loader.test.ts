import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AtlasPackageFailure,
  WorkerAtlasPackageLoader,
  mainThreadAtlasPackageLoader,
  serveAtlasPackages,
  type AtlasPackagePort,
  type AtlasPackageRequest,
} from '../../src/render/planet/atlas-package-loader.js'
import type { MapTile } from '../../src/scene/mercator.js'

// Real Atlas package of cell 15/16211/12003.
const bytes = readFileSync(
  new URL('./fixtures/atlas-16211-12003/z15-059a2665959db8a9.json', import.meta.url),
)
const tile: MapTile = { z: 15, x: 16211, y: 12003 }
const request = (overrides: Partial<AtlasPackageRequest> = {}): AtlasPackageRequest => ({
  url: 'https://tiles.example.org/z/15/16211/12003/z15-059a2665959db8a9.json',
  tile,
  bytes: bytes.byteLength,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  ...overrides,
})

/** Worker loader wired to an in-process "worker" over a real MessageChannel. */
function workerLoader() {
  const channel = new MessageChannel()
  serveAtlasPackages(channel.port2 as unknown as AtlasPackagePort)
  const loader = new WorkerAtlasPackageLoader(channel.port1 as unknown as AtlasPackagePort)
  channel.port1.start()
  channel.port2.start()
  return { loader, close: () => (channel.port1.close(), channel.port2.close()) }
}

const outcome = async (promise: Promise<unknown>) =>
  promise.then(
    (value) => ({ value }),
    (error: unknown) => ({
      error:
        error instanceof AtlasPackageFailure
          ? { kind: error.kind, status: error.status, message: error.message }
          : String(error),
    }),
  )

describe('Atlas package loaders', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['a valid package', {}, () => new Response(bytes)],
    ['an HTTP error', {}, () => new Response('', { status: 403 })],
    ['a size mismatch', { bytes: 1 }, () => new Response(bytes)],
    ['a SHA-256 mismatch', { sha256: 'a'.repeat(64) }, () => new Response(bytes)],
    ['a package for another cell', { tile: { z: 15, x: 1, y: 1 } }, () => new Response(bytes)],
  ] as const)('main-thread and worker loaders agree on %s', async (_, overrides, respond) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond()),
    )
    const { loader, close } = workerLoader()
    try {
      const main = await outcome(mainThreadAtlasPackageLoader.load(request(overrides)))
      const worker = await outcome(loader.load(request(overrides)))
      expect(worker).toEqual(main)
    } finally {
      close()
    }
  })

  it('the worker loader rejects with the abort reason and cancels the worker request', async () => {
    let seen: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_: string, init: RequestInit) =>
          new Promise<Response>((_, reject) => {
            seen = init.signal!
            init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
          }),
      ),
    )
    const { loader, close } = workerLoader()
    try {
      const controller = new AbortController()
      const load = loader.load(request(), controller.signal)
      await vi.waitFor(() => expect(seen).toBeDefined())
      controller.abort()
      await expect(load).rejects.toBe(controller.signal.reason)
      await vi.waitFor(() => expect(seen!.aborted).toBe(true))
    } finally {
      close()
    }
  })
})
