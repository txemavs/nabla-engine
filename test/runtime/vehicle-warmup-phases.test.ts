import { afterEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { VehicleWarmup } from '../../src/runtime/vehicle-warmup.js'
afterEach(() => vi.unstubAllGlobals())
it('yields and reports each expensive phase with render state restored between scene and mirrors', async () => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
  const scene = new THREE.Scene(),
    root = new THREE.Group(),
    object = new THREE.Group()
  root.add(object)
  let target: unknown = null
  const renderer = {
    shadowMap: { needsUpdate: false },
    initTexture: vi.fn(),
    compileAsync: vi.fn(async () => {}),
    getRenderTarget: () => target,
    setRenderTarget: (t: unknown) => {
      target = t
    },
    render: vi.fn(() => {
      expect(target).not.toBeNull()
      expect(scene.children).toHaveLength(1)
    }),
  }
  const mirrors = vi.fn(() => {
    expect(target).not.toBeNull()
  })
  const warmup = new VehicleWarmup({
    renderer: renderer as any,
    scene,
    camera: new THREE.PerspectiveCamera(),
    createView: () =>
      ({
        root,
        objects: new Map([['car', object]]),
        ready: Promise.resolve(),
        setPlaying() {},
        mirroredVehicles: ['car'],
        renderMirrors: mirrors,
        dispose() {},
      }) as any,
  })
  const phases: string[] = []
  await warmup.warm([{ id: 'car' } as any], async (phase) => {
    phases.push(phase)
    expect(target).toBeNull()
    expect(scene.children).toHaveLength(0)
    expect(renderer.shadowMap.needsUpdate).toBe(false)
  })
  expect(phases).toEqual([
    'Loading model',
    'Preparing materials',
    'Compiling vehicle shaders',
    'Rendering scene and shadows',
    'Rendering mirrors 1/1',
    'Vehicle ready',
  ])
  expect(renderer.render).toHaveBeenCalledTimes(1)
  expect(mirrors).toHaveBeenCalledTimes(1)
  warmup.dispose()
})
