import { expect, test } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import {
  createGameCameraState,
  cycleGameCamera,
  downwardViewFar,
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

  // Ordinary overhead entry now uses the same continuous view blend.
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
  expect(cycleGameCamera(state, true)).toBe('map')
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
  expect(camera.fov).toBeLessThan(state.settings.firstPersonFov + 12)
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

test('entering overhead preserves the exact previous pose on its first frame', async () => {
  const { session, sim, view } = await seated()
  const camera = new PerspectiveCamera()
  const state = createGameCameraState()
  state.mode = 'cockpit'
  updateGameCamera(sim, view, camera, state, 1000, 1 / 60)
  const cockpit = camera.position.clone()
  const quaternion = camera.quaternion.clone()
  const fov = camera.fov
  setGameCameraView(state, 'map', true)
  updateGameCamera(sim, view, camera, state, 1016, 1 / 60)
  expect(state.transition).not.toBeNull()
  expect(camera.position.distanceTo(cockpit)).toBeLessThan(1e-8)
  expect(camera.quaternion.angleTo(quaternion)).toBeLessThan(1e-7)
  expect(camera.fov).toBe(fov)
  session.dispose()
})

test('walking roll and bodycam FOV belong to the blend, including interrupted changes', async () => {
  const session = new PlaySession()
  const document: SceneDocument = {
    version: 1,
    name: 'Foot continuity',
    entities: [createEntity('spawn', 'spawn', [0, 1, 0])],
  }
  const sim = await session.play(document, { playerMode: 'walk' })
  const view = { document, objects: new Map(), vehicleHeadOffset: () => undefined }
  const state = createGameCameraState()
  state.mode = 'chase'
  state.firstPerson = true
  state.bodycam = true
  state.walkingMotion = { side: 0.014, up: -0.025, pitch: 0.006, roll: 0.03 }
  state.firstPersonFovOffset = 8
  const camera = new PerspectiveCamera()
  updateGameCamera(sim, view, camera, state, 1000, 1 / 60)
  expect(camera.fov).toBe(state.settings.firstPersonFov + 8)
  const rendered = {
    position: camera.position.clone(),
    rotation: camera.quaternion.clone(),
    fov: camera.fov,
  }
  state.walkingMotion = null
  setGameCameraView(state, 'chase', false)
  updateGameCamera(sim, view, camera, state, 1016, 1 / 60)
  expect(camera.position.distanceTo(rendered.position)).toBeLessThan(1e-8)
  expect(camera.quaternion.angleTo(rendered.rotation)).toBeLessThan(1e-7)
  expect(camera.fov).toBe(rendered.fov)
  updateGameCamera(sim, view, camera, state, 1100, 1 / 60)
  const interrupted = {
    position: camera.position.clone(),
    rotation: camera.quaternion.clone(),
    fov: camera.fov,
  }
  setGameCameraView(state, 'map', false)
  updateGameCamera(sim, view, camera, state, 1116, 1 / 60)
  expect(camera.position.distanceTo(interrupted.position)).toBeLessThan(1e-8)
  expect(camera.quaternion.angleTo(interrupted.rotation)).toBeLessThan(1e-7)
  expect(camera.fov).toBe(interrupted.fov)
  session.dispose()
})

test('a steep look-down caps the far plane to the ground under the camera', () => {
  expect(downwardViewFar(12000, 45, -0.2)).toBe(12000)
  expect(downwardViewFar(12000, 45, -0.9)).toBe(45 * 3 + 80)
  expect(downwardViewFar(12000, 10, -0.9)).toBe(180)
  expect(downwardViewFar(12000, 400, -1)).toBe(400 * 3 + 80)
  expect(downwardViewFar(200, 400, -1)).toBe(200)
  expect(downwardViewFar(Number.NaN, 40, -1)).toBeNaN()
  // A wide cockpit still sees the horizon even when its central ray points down.
  expect(downwardViewFar(12000, 400, -0.7, 90, 16 / 9)).toBe(12000)
  expect(downwardViewFar(12000, 400, -0.9, 90, 16 / 9)).toBe(12000)
  // A true overhead frustum can still use a shorter far plane for shadow quality.
  expect(downwardViewFar(12000, 400, -1, 60, 16 / 9)).toBeLessThan(2000)
})
