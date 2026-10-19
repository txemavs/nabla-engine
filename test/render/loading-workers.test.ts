import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTileClusters,
  buildTileClustersWith,
  installTileClusterCullingWith,
  tileClustersOf,
} from '../../src/render/planet/cluster-culling.js'
import {
  WorkerLoading,
  mainThreadLoading,
  serveTileLoading,
} from '../../src/render/planet/loading-workers.js'

/** Worker loading wired to an in-process "worker" over a real MessageChannel (real transfers). */
function workerLoading() {
  const channel = new MessageChannel()
  type Port = ConstructorParameters<typeof WorkerLoading>[0]
  serveTileLoading(channel.port2 as unknown as Port)
  const loading = new WorkerLoading(channel.port1 as unknown as Port)
  channel.port1.start()
  channel.port2.start()
  return { loading, close: () => (channel.port1.close(), channel.port2.close()) }
}

/** A bumpy 256 m square on XZ, `n`×`n` quads, with uvs and normals. */
function tileGeometry(n: number, indexed: boolean): THREE.BufferGeometry {
  const plane = new THREE.PlaneGeometry(256, 256, n, n)
  plane.rotateX(-Math.PI / 3)
  plane.rotateY(0.4)
  const position = plane.getAttribute('position')
  for (let v = 0; v < position.count; v++) position.setY(v, Math.sin(v * 0.37) * 7)
  return indexed ? plane : plane.toNonIndexed()
}

const snapshot = (geometry: THREE.BufferGeometry) => ({
  index: geometry.index ? [...geometry.index.array] : undefined,
  attributes: Object.fromEntries(
    Object.entries(geometry.attributes).map(([name, a]) => [
      name,
      {
        array: [...(a as THREE.BufferAttribute).array],
        normalized: a.normalized,
        type: a.array.constructor.name,
      },
    ]),
  ),
})

describe('loading workers: cluster-culling reorder', () => {
  it.each([true, false])(
    'worker and main thread give identical geometry (indexed: %s)',
    async (indexed) => {
      const { loading, close } = workerLoading()
      try {
        const main = tileGeometry(64, indexed)
        const off = tileGeometry(64, indexed)
        const before = snapshot(off)
        const mainClusters = buildTileClusters(main)!
        const offClusters = (await buildTileClustersWith(off, (input) => loading.clusters(input)))!
        expect(offClusters).toEqual(mainClusters)
        expect(snapshot(off)).toEqual(snapshot(main))
        expect(snapshot(off)).not.toEqual(before)
      } finally {
        close()
      }
    },
  )

  it('the main-thread runner equals the synchronous build', async () => {
    const a = tileGeometry(64, true)
    const b = tileGeometry(64, true)
    expect(await buildTileClustersWith(b, mainThreadLoading.clusters)).toEqual(buildTileClusters(a))
    expect(snapshot(b)).toEqual(snapshot(a))
  })

  it('leaves a geometry changed while the job ran, or a removed mesh, untouched', async () => {
    const { loading, close } = workerLoading()
    try {
      const geometry = tileGeometry(64, true)
      const job = buildTileClustersWith(geometry, (input) => loading.clusters(input))
      const replaced = geometry.index!.clone()
      geometry.setIndex(replaced)
      expect(await job).toBeUndefined()
      expect(geometry.index).toBe(replaced)

      const mesh = new THREE.Mesh(tileGeometry(64, true))
      const index = mesh.geometry.index
      expect(await installTileClusterCullingWith(mesh, (input) => loading.clusters(input))).toBe(
        false,
      )
      expect(mesh.geometry.index).toBe(index)
      expect(tileClustersOf(mesh)).toBeUndefined()
    } finally {
      close()
    }
  })
})

describe('loading workers: package photo', () => {
  afterEach(() => vi.unstubAllGlobals())
  const bytes = new TextEncoder().encode('not really a webp, decoded by a stub')
  const photo = {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }

  const outcome = (promise: Promise<unknown>) =>
    promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error: String(error) }),
    )

  it.each([
    ['a valid photo', photo, 200],
    ['an HTTP error', photo, 404],
    ['a size mismatch', { ...photo, bytes: 1 }, 200],
    ['a checksum mismatch', { ...photo, sha256: 'b'.repeat(64) }, 200],
  ] as const)('worker and main thread agree on %s', async (_, expected, status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { status })),
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (blob: Blob, options: ImageBitmapOptions) => ({
        width: blob.size,
        height: 1,
        orientation: options.imageOrientation,
      })),
    )
    const { loading, close } = workerLoading()
    try {
      const url = 'https://tiles.example.org/z/15/1/1/ground.webp'
      const mainMarks: string[] = []
      const offMarks: string[] = []
      const main = await outcome(mainThreadLoading.photo(url, expected, (n) => mainMarks.push(n)))
      const off = await outcome(loading.photo(url, expected, (n) => offMarks.push(n)))
      expect(off).toEqual(main)
      expect(offMarks).toEqual(mainMarks)
    } finally {
      close()
    }
  })
})

describe('loading workers: kill switch', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('is on by default and off with ?loadingWorkers=0|false|off or without Worker', async () => {
    const { loadingWorkersEnabled } = await import('../../src/render/planet/loading-workers.js')
    vi.stubGlobal('Worker', class {})
    expect(loadingWorkersEnabled('')).toBe(true)
    expect(loadingWorkersEnabled('?renderer=webgl&clusterCulling=1')).toBe(true)
    expect(loadingWorkersEnabled('?loadingWorkers=1')).toBe(true)
    for (const off of ['0', 'false', 'OFF'])
      expect(loadingWorkersEnabled(`?loadingWorkers=${off}`)).toBe(false)
    vi.unstubAllGlobals()
    vi.stubGlobal('Worker', undefined)
    expect(loadingWorkersEnabled('')).toBe(false)
  })
})
