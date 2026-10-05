import { expect, it, vi } from 'vitest'
import { PerspectiveCamera, Scene } from 'three'
import { warmGamePresentation } from '../../src/runtime/presentation-warmup.js'

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
