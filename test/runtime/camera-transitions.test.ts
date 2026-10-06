import { expect, test } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import {
  createGameCameraState,
  cycleGameCamera,
  setGameCameraView,
  updateGameCamera,
} from '../../src/runtime/game-camera.js'
import { PlaySession } from '../../src/runtime/session.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import type { SceneDocument } from '../../src/scene/document.js'

async function seated() {
  const session = new PlaySession()
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [400, 1, 400]
  const document: SceneDocument = {
    version: 1,
    name: 'Transitions',
    entities: [floor, createEntity('spawn', 'spawn'), presetVehicle('car', 'car', [0, 0.7, 0])],
  }
  const sim = await session.play(document, { vehicleId: 'car' })
  const view = { document, objects: new Map(), vehicleHeadOffset: () => undefined }
  return { session, sim, view }
}

test('a view change moves the camera smoothly instead of cutting', async () => {
  const { session, sim, view } = await seated()
  const camera = new PerspectiveCamera()
  const state = createGameCameraState()
  state.mode = 'chase'
  updateGameCamera(sim, view, camera, state, 1000, 1 / 60)
  const chase = camera.position.clone()
  // Where the overhead view settles, rendered by a camera that cuts.
  const cut = createGameCameraState({ modeTransitionMs: 0 })
  cut.mode = 'chase'
  const reference = new PerspectiveCamera()
  updateGameCamera(sim, view, reference, cut, 1000, 1 / 60)
  setGameCameraView(cut, 'map', true)
  updateGameCamera(sim, view, reference, cut, 1016, 1 / 60)
  const overhead = reference.position.clone()
  expect(cut.transition).toBeNull()
  expect(overhead.distanceTo(chase)).toBeGreaterThan(10)

  setGameCameraView(state, 'map', true)
  const duration = state.settings.modeTransitionMs
  const heights: number[] = []
  for (let t = 16; t <= duration + 32; t += 16) {
    updateGameCamera(sim, view, camera, state, 1000 + t, 1 / 60)
    heights.push(camera.position.y)
    if (t === 16) expect(camera.position.distanceTo(chase)).toBeLessThan(0.5)
    if (t === 352) {
      expect(state.transition).not.toBeNull()
      expect(camera.position.y).toBeGreaterThan(chase.y + 2)
      expect(camera.position.y).toBeLessThan(overhead.y - 2)
    }
  }
  // Eased: the climb never reverses and lands on the overhead pose.
  for (let i = 1; i < heights.length; i++)
    expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1] - 1e-6)
  expect(state.transition).toBeNull()
  expect(camera.position.distanceTo(overhead)).toBeLessThan(1)
  session.dispose()
})

test('C blends too, a one-off duration applies once, and 0 cuts', async () => {
  const { session, sim, view } = await seated()
  const camera = new PerspectiveCamera()
  const state = createGameCameraState()
  state.mode = 'chase'
  updateGameCamera(sim, view, camera, state, 1000, 1 / 60)
  expect(cycleGameCamera(state, true)).toBe('cockpit')
  updateGameCamera(sim, view, camera, state, 1016, 1 / 60)
  expect(state.transition?.duration).toBe(state.settings.modeTransitionMs)
  state.nextTransitionMs = 2000
  setGameCameraView(state, 'chase', true)
  updateGameCamera(sim, view, camera, state, 1032, 1 / 60)
  expect(state.transition?.duration).toBe(2000)
  expect(state.nextTransitionMs).toBeNull()
  state.nextTransitionMs = 0
  setGameCameraView(state, 'map', true)
  updateGameCamera(sim, view, camera, state, 1048, 1 / 60)
  expect(state.transition).toBeNull()
  // The field of view follows the blend instead of jumping.
  setGameCameraView(state, 'cockpit', true)
  updateGameCamera(sim, view, camera, state, 1064, 1 / 60)
  updateGameCamera(sim, view, camera, state, 1064 + 350, 1 / 60)
  expect(camera.fov).toBeGreaterThan(state.settings.chaseFov)
  expect(camera.fov).toBeLessThan(state.settings.firstPersonFov)
  session.dispose()
})

test('boarding keeps the entrance move and leaving a vehicle does not blend', async () => {
  const { session, sim, view } = await seated()
  const camera = new PerspectiveCamera()
  const state = createGameCameraState()
  state.mode = 'cockpit'
  state.entrance = { id: 'car', started: 1000 }
  updateGameCamera(sim, view, camera, state, 1000, 1 / 60)
  setGameCameraView(state, 'cockpit', true)
  state.entrance = { id: 'car', started: 1000 }
  state.lastView = { view: 'chase', vehicleId: 'car' }
  updateGameCamera(sim, view, camera, state, 1016, 1 / 60)
  expect(state.transition).toBeNull()
  state.lastView = { view: 'first-person', vehicleId: null }
  state.entrance = null
  updateGameCamera(sim, view, camera, state, 1032, 1 / 60)
  expect(state.transition).toBeNull()
  expect(new Vector3().copy(camera.position).length()).toBeGreaterThan(0)
  session.dispose()
})
