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
  await warmGamePresentation({
    renderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    view: { mirroredVehicles: ['car'], renderMirrors: vi.fn() },
    settings: { firstPersonFov: 70, chaseFov: 48 },
    signal: controller.signal,
  })
  expect(renderer.compileAsync).not.toHaveBeenCalled()
})
