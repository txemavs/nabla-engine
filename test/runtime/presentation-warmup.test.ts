import { expect, it, vi } from 'vitest'
import { PerspectiveCamera, Scene, Group, type WebGLRenderer } from 'three'
import {
  warmGamePresentation,
  warmEffectPresentation,
} from '../../src/runtime/presentation-warmup.js'

it('warms hidden effects offscreen without changing gameplay visibility or shadow update flags', async () => {
  const root = new Group(),
    child = new Group()
  root.visible = false
  child.visible = false
  root.add(child)
  const previous = {},
    targets: unknown[] = []
  const renderer = {
    shadowMap: { autoUpdate: true, needsUpdate: true },
    compileAsync: async (scene: Scene) => {
      expect(scene.children[0].visible).toBe(true)
      expect(scene.children[0].children[0].visible).toBe(true)
    },
    getRenderTarget: () => previous,
    setRenderTarget: (target: unknown) => targets.push(target),
    render: () => {
      throw new Error('GPU unavailable')
    },
  }
  await expect(
    warmEffectPresentation(renderer as unknown as WebGLRenderer, new PerspectiveCamera(), [root]),
  ).rejects.toThrow('GPU unavailable')
  expect(root.visible).toBe(false)
  expect(child.visible).toBe(false)
  expect(targets[targets.length - 1]).toBe(previous)
  expect(renderer.shadowMap).toEqual({ autoUpdate: true, needsUpdate: true })
})

it('compiles chase and cockpit programs once and warms each mirrored vehicle', async () => {
  const renderer = { compileAsync: vi.fn(async () => {}) }
  const view = {
    mirroredVehicles: ['car', 'truck'],
    renderMirrors: vi.fn(),
  }
  const camera = new PerspectiveCamera(48, 1, 0.1, 1000)
  await warmGamePresentation({
    renderer,
    scene: new Scene(),
    camera,
    view,
    settings: { firstPersonFov: 70, chaseFov: 48 },
  })
  expect(renderer.compileAsync).toHaveBeenCalledTimes(2)
  expect(view.renderMirrors).toHaveBeenCalledTimes(3)
  expect(view.renderMirrors.mock.calls.map((call) => call[3])).toEqual(['car', 'truck', null])
  expect(camera.fov).toBe(48)
})

it('stops when the play session is aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const renderer = { compileAsync: vi.fn(async () => {}) }
  await expect(
    warmGamePresentation({
      renderer,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      view: { mirroredVehicles: ['car'], renderMirrors: vi.fn() },
      settings: { firstPersonFov: 70, chaseFov: 48 },
      signal: controller.signal,
    }),
  ).rejects.toThrow()
  expect(renderer.compileAsync).not.toHaveBeenCalled()
})

it('uses actual world lighting and removes warmup copies even when compilation fails', async () => {
  const scene = new Scene(),
    original = new Group(),
    effect = new Group()
  original.name = 'world'
  scene.add(original)
  effect.visible = false
  const renderer = {
    shadowMap: { autoUpdate: true, needsUpdate: false },
    getRenderTarget: () => null,
    setRenderTarget: vi.fn(),
    compileAsync: async (target: Scene) => {
      expect(target).toBe(scene)
      expect(scene.children).toHaveLength(2)
      expect(scene.children[1].visible).toBe(true)
      throw new Error('compile failed')
    },
  }
  await expect(
    warmEffectPresentation(
      renderer as unknown as WebGLRenderer,
      new PerspectiveCamera(),
      [effect],
      scene,
    ),
  ).rejects.toThrow('compile failed')
  expect(scene.children).toEqual([original])
  expect(effect.visible).toBe(false)
  expect(renderer.shadowMap).toEqual({ autoUpdate: true, needsUpdate: false })
})

it('reports preparation failure instead of silently declaring the views ready', async () => {
  const camera = new PerspectiveCamera(48, 1, 0.1, 1000)
  await expect(
    warmGamePresentation({
      renderer: {
        compileAsync: async () => {
          throw new Error('GPU compilation failed')
        },
      },
      scene: new Scene(),
      camera,
      view: { mirroredVehicles: [], renderMirrors: vi.fn() },
      settings: { firstPersonFov: 70, chaseFov: 60 },
    }),
  ).rejects.toThrow('GPU compilation failed')
  expect(camera.fov).toBe(48)
})
