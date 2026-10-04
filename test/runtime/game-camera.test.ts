import { expect, test } from 'vitest'
import { PerspectiveCamera } from 'three'
import { createGameCameraState, updateGameCamera } from '../../src/runtime/game-camera.js'
import { PlaySession } from '../../src/runtime/session.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import type { SceneDocument } from '../../src/scene/document.js'

test('Studio cameras work without editor DOM and cover cockpit, chase and overhead', async () => {
  const session = new PlaySession()
  const document: SceneDocument = {
    version: 1,
    name: 'Camera test',
    entities: [createEntity('spawn', 'spawn'), presetVehicle('car', 'car', [0, 2, 0])],
  }
  const sim = await session.play(document, { vehicleId: 'car' })
  const view = { document, objects: new Map(), vehicleHeadOffset: () => undefined }
  const camera = new PerspectiveCamera(),
    state = createGameCameraState()
  state.mode = 'cockpit'
  const cockpit = updateGameCamera(sim, view, camera, state, 1000, 1 / 60)
  const driver = camera.position.clone()
  expect(cockpit.info).not.toBeNull()
  expect(camera.fov).toBe(70)
  state.mode = 'chase'
  updateGameCamera(sim, view, camera, state, 1100, 1 / 60)
  expect(camera.fov).toBe(48)
  expect(camera.position.distanceTo(driver)).toBeGreaterThan(1)
  state.mode = 'map'
  const overhead = updateGameCamera(sim, view, camera, state, 1200, 1 / 60)
  expect(overhead.overhead).toBe(true)
  expect(camera.position.y).toBeGreaterThan(sim.player.position[1] + 40)
  expect(camera.position.toArray().every(Number.isFinite)).toBe(true)
  session.dispose()
})

test('camera state is independent for separate consumers', () => {
  const a = createGameCameraState(),
    b = createGameCameraState()
  a.telemetry.update('car', 30, 0, 1 / 60)
  a.yaw = 1
  expect(b.telemetry.speed).toBe(0)
  expect(b.yaw).toBe(0)
})
