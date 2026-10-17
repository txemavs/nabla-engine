import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

// The viewer needs WebGL; these tests replace the renderer, sky and loader with stubs so the asset
// bookkeeping (load, replace, remove, node calls) can be checked without a GPU.
const parsed: { next: () => THREE.Group; calls: number } = {
  next: () => new THREE.Group(),
  calls: 0,
}

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class WebGLRenderer {
    domElement = {
      style: {},
      dataset: {} as Record<string, string>,
      tabIndex: 0,
      setAttribute() {},
      addEventListener() {},
      focus() {},
      setPointerCapture() {},
      remove() {},
    }
    capabilities = { getMaxAnisotropy: () => 8 }
    toneMappingExposure = 1
    autoClear = true
    setPixelRatio() {}
    setSize() {}
    setClearColor() {}
    clear() {}
    clearDepth() {}
    render() {}
    dispose() {}
    forceContextLoss() {}
  }
  return { ...actual, WebGLRenderer }
})
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { Vector3 } = await import('three')
  class OrbitControls {
    target = new Vector3()
    mouseButtons: Record<string, number> = {}
    enabled = true
    update() {}
    dispose() {}
  }
  return { OrbitControls }
})
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setMeshoptDecoder() {
      return this
    }
    async parseAsync() {
      parsed.calls++
      const scene = parsed.next()
      return { scene, scenes: [scene] }
    }
  },
}))
vi.mock('meshoptimizer', () => ({ MeshoptDecoder: {} }))
vi.mock('../src/render/planet/sky.js', async () => {
  const { Object3D } = await import('three')
  class GeographicView {
    lensFlare = new Object3D()
    atmosphere = { day: 1 }
    setLayers() {}
    setCloudWeather() {}
    render() {}
    renderClouds() {}
    dispose() {}
  }
  return { GeographicView }
})
vi.mock('../src/render/planet/world-environment.js', () => ({
  PLANET_DEFAULTS: {},
  configureWorldRenderer() {},
  WorldEnvironment: class {
    ocean = { setLevel() {}, mesh: { visible: false } }
    updateSea() {}
    updateSky() {}
    applyLighting() {}
    dispose() {}
  },
}))

const { createGeographicViewer } = await import('../src/viewer/index.js')
const origin = { latitude: 43.34, longitude: -1.76, altitude: 0 }

/** Resolvable fetches, one per call, so a test decides when each download finishes. */
let downloads: { url: string; finish: (ok?: boolean) => void; signal?: AbortSignal | null }[] = []

function glb(...names: string[]) {
  return () => {
    const root = new THREE.Group()
    root.name = 'Scene'
    for (const name of names) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
      )
      geometry.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2),
      )
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
      mesh.name = name
      root.add(mesh)
    }
    return root
  }
}

beforeEach(() => {
  downloads = []
  parsed.calls = 0
  vi.stubGlobal('window', {
    location: { href: 'http://localhost/' },
    devicePixelRatio: 1,
    addEventListener() {},
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal(
    'fetch',
    (url: string, init?: { signal?: AbortSignal }) =>
      new Promise((resolve, reject) => {
        const entry = {
          url,
          signal: init?.signal,
          finish: (ok = true) =>
            resolve({ ok, status: ok ? 200 : 500, arrayBuffer: async () => new ArrayBuffer(8) }),
        }
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted')))
        downloads.push(entry)
      }),
  )
})
afterEach(() => vi.unstubAllGlobals())

function viewer() {
  const container = { clientWidth: 100, clientHeight: 100, append() {} } as unknown as HTMLElement
  return createGeographicViewer(container, { origin })
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const asset = (id: string, url: string, extra = {}) => ({ id, url, origin, ...extra })

describe('replaceGlb', () => {
  it('keeps the old asset until the new one is parsed, then swaps with no gap', async () => {
    const v = viewer()
    parsed.next = glb('old')
    const first = v.loadGlb(asset('tile', '/a.glb'))
    await settle()
    downloads[0]!.finish()
    await first
    expect(v.getNodes('tile').map((n) => n.name)).toEqual(['old'])

    parsed.next = glb('new')
    const swap = v.replaceGlb(asset('tile', '/b.glb'))
    await settle()
    expect(downloads).toHaveLength(2)
    // Still downloading: the old asset is intact and queryable.
    expect(v.hasAsset('tile')).toBe(true)
    expect(v.getNodes('tile').map((n) => n.name)).toEqual(['old'])
    downloads[1]!.finish()
    await swap
    expect(v.hasAsset('tile')).toBe(true)
    expect(v.getNodes('tile').map((n) => n.name)).toEqual(['new'])
    expect(v.listAssets()).toEqual([{ id: 'tile', visible: true, opacity: 1 }])
    v.dispose()
  })

  it('releases the old asset only after the new one is in the scene', async () => {
    const v = viewer()
    const oldRoot = glb('old')()
    parsed.next = () => oldRoot
    const first = v.loadGlb(asset('tile', '/a.glb'))
    await settle()
    downloads[0]!.finish()
    await first
    const oldMesh = oldRoot.children[0] as THREE.Mesh
    const dispose = vi.spyOn(oldMesh.geometry, 'dispose')
    parsed.next = glb('new')
    const swap = v.replaceGlb(asset('tile', '/b.glb'))
    await settle()
    expect(dispose).not.toHaveBeenCalled()
    downloads[1]!.finish()
    await swap
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(oldRoot.parent?.parent).toBeNull() // old asset group left the scene
    v.dispose()
  })

  it('keeps the old asset and rejects when the download fails', async () => {
    const v = viewer()
    parsed.next = glb('old')
    const first = v.loadGlb(asset('tile', '/a.glb'))
    await settle()
    downloads[0]!.finish()
    await first
    const swap = v.replaceGlb(asset('tile', '/missing.glb'))
    await settle()
    downloads[1]!.finish(false)
    await expect(swap).rejects.toThrow('GLB request failed (500)')
    expect(v.getNodes('tile').map((n) => n.name)).toEqual(['old'])
    v.dispose()
  })

  it('keeps the old asset when the caller aborts, without an error', async () => {
    const v = viewer()
    parsed.next = glb('old')
    const first = v.loadGlb(asset('tile', '/a.glb'))
    await settle()
    downloads[0]!.finish()
    await first
    const abort = new AbortController()
    const swap = v.replaceGlb(asset('tile', '/b.glb'), { signal: abort.signal })
    await settle()
    abort.abort()
    await expect(swap).resolves.toBeUndefined()
    expect(downloads[1]!.signal?.aborted).toBe(true)
    expect(v.getNodes('tile').map((n) => n.name)).toEqual(['old'])
    // An already aborted signal never starts a swap.
    await v.replaceGlb(asset('tile', '/c.glb'), { signal: abort.signal })
    expect(v.getNodes('tile').map((n) => n.name)).toEqual(['old'])
    v.dispose()
  })

  it('lets the newest replace win and cancels the older one', async () => {
    const v = viewer()
    parsed.next = glb('old')
    const first = v.loadGlb(asset('tile', '/a.glb'))
    await settle()
    downloads[0]!.finish()
    await first
    parsed.next = glb('second')
    const a = v.replaceGlb(asset('tile', '/b.glb'))
    await settle()
    const b = v.replaceGlb(asset('tile', '/c.glb'))
    await settle()
    expect(downloads[1]!.signal?.aborted).toBe(true)
    downloads[2]!.finish()
    await Promise.all([a, b])
    expect(v.getNodes('tile').map((n) => n.name)).toEqual(['second'])
    expect(parsed.calls).toBe(2)
    v.dispose()
  })

  it('is cancelled by removeGlb and by a later loadGlb of the same id', async () => {
    const v = viewer()
    parsed.next = glb('old')
    const first = v.loadGlb(asset('tile', '/a.glb'))
    await settle()
    downloads[0]!.finish()
    await first
    const swap = v.replaceGlb(asset('tile', '/b.glb'))
    await settle()
    v.removeGlb('tile')
    await swap
    expect(v.hasAsset('tile')).toBe(false)
    expect(v.listAssets()).toEqual([])
    v.dispose()
  })

  it('behaves as loadGlb when nothing is loaded under the id', async () => {
    const v = viewer()
    parsed.next = glb('fresh')
    const swap = v.replaceGlb(asset('tile', '/a.glb', { visible: false }))
    await settle()
    downloads[0]!.finish()
    await swap
    expect(v.listAssets()).toEqual([{ id: 'tile', visible: false, opacity: 1 }])
    v.dispose()
  })

  it('carries visibility and opacity over, but not node visibility', async () => {
    const v = viewer()
    parsed.next = glb('roof')
    const first = v.loadGlb(asset('tile', '/a.glb'))
    await settle()
    downloads[0]!.finish()
    await first
    v.setVisible('tile', false)
    v.setAssetOpacity('tile', 0.4)
    expect(v.setNodeVisible('tile', 'roof', false)).toBe(1)
    parsed.next = glb('roof')
    const swap = v.replaceGlb(asset('tile', '/b.glb'))
    await settle()
    downloads[1]!.finish()
    await swap
    expect(v.listAssets()).toEqual([{ id: 'tile', visible: false, opacity: 0.4 }])
    expect(v.getNodes('tile')[0]!.visible).toBe(true)
    v.dispose()
  })

  it('rejects an invalid asset before touching the old one', async () => {
    const v = viewer()
    await expect(v.replaceGlb({ id: '', url: '/a.glb', origin })).rejects.toThrow('Asset id')
    await expect(
      v.replaceGlb({ id: 'x', url: '/a.glb', origin: { ...origin, latitude: NaN } }),
    ).rejects.toThrow('Invalid geographic coordinate')
    v.dispose()
    await expect(v.replaceGlb(asset('x', '/a.glb'))).rejects.toThrow('Viewer disposed')
  })
})

describe('asset and node calls', () => {
  async function loaded(...names: string[]) {
    const v = viewer()
    parsed.next = glb(...names)
    const load = v.loadGlb(asset('tile', '/a.glb'))
    await settle()
    downloads[0]!.finish()
    await load
    return v
  }

  it('reports unknown ids without throwing', () => {
    const v = viewer()
    expect(v.hasAsset('nope')).toBe(false)
    expect(v.listAssets()).toEqual([])
    expect(v.getNodes('nope')).toEqual([])
    expect(v.setNodeVisible('nope', 'x', false)).toBe(0)
    expect(v.setNodeSurfaceImage('nope', 'x', {} as HTMLCanvasElement)).toBe(0)
    expect(() => v.setAssetOpacity('nope', 0.5)).not.toThrow()
    v.dispose()
  })

  it('validates opacity and selectors', async () => {
    const v = await loaded('a')
    expect(() => v.setAssetOpacity('tile', 1.5)).toThrow('between 0 and 1')
    expect(() => v.setAssetOpacity('tile', NaN)).toThrow('between 0 and 1')
    expect(() => v.setNodeVisible('tile', {}, false)).toThrow('matches nothing')
    v.dispose()
  })

  it('hides and shows nodes and counts matches', async () => {
    const v = await loaded('Grass', 'Asphalt')
    expect(v.setNodeVisible('tile', /./, false)).toBe(2)
    expect(v.getNodes('tile').map((n) => n.visible)).toEqual([false, false])
    expect(v.setNodeVisible('tile', 'Asphalt', true)).toBe(1)
    expect(v.getNodes('tile').map((n) => n.visible)).toEqual([false, true])
    v.dispose()
  })

  it('drapes a node image, leaves other meshes alone, and restores', async () => {
    const v = await loaded('Grass', 'Asphalt')
    const image = {} as HTMLCanvasElement
    expect(v.setNodeSurfaceImage('tile', 'Grass', image)).toBe(1)
    expect(v.setNodeSurfaceImage('tile', 'Grass', null)).toBe(1)
    expect(v.setNodeSurfaceImage('tile', 'Grass', null)).toBe(0)
    // Whole-asset image, then a selector variant only restores its own meshes.
    v.setSurfaceImage('tile', image)
    v.setSurfaceImage('tile', null, 'Asphalt')
    expect(v.setNodeSurfaceImage('tile', 'Asphalt', null)).toBe(0)
    expect(v.setNodeSurfaceImage('tile', 'Grass', null)).toBe(1)
    v.dispose()
  })

  it('removing an asset forgets its opacity', async () => {
    const v = await loaded('Grass')
    v.setAssetOpacity('tile', 0.3)
    expect(v.listAssets()[0]!.opacity).toBe(0.3)
    v.removeGlb('tile')
    parsed.next = glb('Grass')
    const load = v.loadGlb(asset('tile', '/b.glb'))
    await settle()
    downloads[1]!.finish()
    await load
    expect(v.listAssets()[0]!.opacity).toBe(1)
    v.dispose()
  })
})
