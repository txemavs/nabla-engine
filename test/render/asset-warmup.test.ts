import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  AssetWarmup,
  materialTextures,
  visualAssetUrls,
} from '../../src/render/entity/asset-warmup.js'

function model() {
  const map = new THREE.Texture()
  const normal = new THREE.Texture()
  const root = new THREE.Group()
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map })))
  root.add(
    new THREE.Mesh(new THREE.BoxGeometry(), [
      new THREE.MeshStandardMaterial({ map, normalMap: normal }),
    ]),
  )
  root.add(new THREE.SpotLight())
  return root
}

describe('asset warm-up', () => {
  it('lists every GLB a visual names, once', () => {
    expect(
      visualAssetUrls({
        body: { url: '/a/body.glb', transform: {} },
        wheels: [{ url: '/a/wheel.glb' }, { url: '/a/wheel.glb' }],
        steering: { url: '/a/steer.glb?v=2' },
        presentation: 'truck',
      }),
    ).toEqual(['/a/body.glb', '/a/wheel.glb', '/a/steer.glb?v=2'])
    expect(visualAssetUrls(undefined)).toEqual([])
  })

  it('finds unique material textures', () => {
    expect(materialTextures(model())).toHaveLength(2)
  })

  it('uploads one texture per frame, compiles with lamps hidden and reuses the result', async () => {
    const log: string[] = []
    let instantiated = 0
    let compiled: THREE.Object3D | undefined
    const warmup = new AssetWarmup(
      {
        renderer: {
          initTexture: () => void log.push('upload'),
          compileAsync: async (object: THREE.Object3D) => {
            compiled = object
            log.push('compile')
            return object
          },
        } as unknown as THREE.WebGLRenderer,
        camera: new THREE.PerspectiveCamera(),
        scene: new THREE.Scene(),
      },
      {
        instantiate: async () => {
          instantiated++
          return model()
        },
      },
      async () => void log.push('frame'),
    )
    await warmup.warmVisual({ body: { url: '/a/body.glb' } })
    await warmup.warm('/a/body.glb')
    expect(instantiated).toBe(1)
    expect(log).toEqual(['frame', 'upload', 'frame', 'upload', 'compile'])
    const lights: THREE.Light[] = []
    compiled!.traverse((o) => o instanceof THREE.Light && lights.push(o))
    expect(lights.every((light) => !light.visible)).toBe(true)
    warmup.dispose()
  })

  it('retries a GLB that failed to load', async () => {
    let calls = 0
    const warmup = new AssetWarmup(
      {
        renderer: {
          initTexture: () => {},
          compileAsync: async (o: THREE.Object3D) => o,
        } as unknown as THREE.WebGLRenderer,
        camera: new THREE.PerspectiveCamera(),
        scene: new THREE.Scene(),
      },
      {
        instantiate: async () => {
          if (++calls === 1) throw new Error('offline')
          return new THREE.Group()
        },
      },
      async () => {},
    )
    await expect(warmup.warm('/x.glb')).rejects.toThrow('offline')
    await expect(warmup.warm('/x.glb')).resolves.toBeUndefined()
    expect(calls).toBe(2)
  })
})
