import { expect, test } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import {
  createGameCameraState,
  mouseLooksWithoutButton,
  updateGameCamera,
} from '../../src/runtime/game-camera.js'
import { PlaySession } from '../../src/runtime/session.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import type { SceneDocument } from '../../src/scene/document.js'
import { gameCameraDefaults, resolveGameCameraSettings } from '../../src/config/camera.js'
import { followDrivingHeading } from '../../src/render/entity/driving-camera.js'
import { GameRuntime } from '../../src/runtime/game.js'

test('manual look lasts ten seconds, then recovery ramps up and can be overridden', () => {
  for (const elapsed of [0, 900, 1400, 9999, 10000]) {
    expect(followDrivingHeading(1, 0, 0, 20, 1 / 60, elapsed)).toBe(1)
  }
  const blending = followDrivingHeading(1, 0, 0, 20, 1 / 60, 10250)
  const resumed = followDrivingHeading(1, 0, 0, 20, 1 / 60, 10500)
  expect(blending).toBeLessThan(1)
  expect(resumed).toBeLessThan(blending)
  const custom = resolveGameCameraSettings({ autoCenterDelayMs: 200, autoCenterBlendMs: 0 })
  expect(followDrivingHeading(1, 0, 0, 20, 1 / 60, 200, custom)).toBe(1)
  expect(followDrivingHeading(1, 0, 0, 20, 1 / 60, 201, custom)).toBeLessThan(1)
  expect(gameCameraDefaults.autoCenterDelayMs).toBe(10000)
  expect(() => resolveGameCameraSettings({ autoCenterDelayMs: -1 })).toThrow(RangeError)
  expect(() => resolveGameCameraSettings({ autoCenterBlendMs: NaN })).toThrow(RangeError)
  expect(() => resolveGameCameraSettings({ speedDampingDivisor: 0 })).toThrow(RangeError)
})

test('camera overrides survive replay without leaking to other runtimes', async () => {
  const game = new GameRuntime({ camera: { autoCenterDelayMs: 3000 } })
  const document: SceneDocument = {
    version: 1,
    name: 'Replay',
    entities: [createEntity('spawn', 'spawn')],
  }
  try {
    await game.play(document)
    game.stop()
    await game.play(document)
    expect(game.cameraState.settings.autoCenterDelayMs).toBe(3000)
    expect(createGameCameraState().settings.autoCenterDelayMs).toBe(10000)
  } finally {
    game.dispose()
  }
})

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

test('chase, first-person and driver views look with the mouse without a held button', () => {
  const state = createGameCameraState()
  for (const mode of ['chase', 'cockpit'] as const) {
    state.mode = mode
    expect(mouseLooksWithoutButton(state, true)).toBe(true)
    expect(mouseLooksWithoutButton(state, false)).toBe(true)
  }
  state.firstPerson = false
  state.mode = 'chase'
  expect(mouseLooksWithoutButton(state, false)).toBe(true)
  // The vehicle overhead map keeps the cursor for wheel zoom and UI.
  state.mode = 'map'
  expect(mouseLooksWithoutButton(state, true)).toBe(false)
  expect(mouseLooksWithoutButton(state, false)).toBe(true)
})

test('flight chase camera leans back for forward perspective and eases out on landing mode', async () => {
  const session = new PlaySession()
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [400, 1, 400]
  const document: SceneDocument = {
    version: 1,
    name: 'Flight camera',
    entities: [
      floor,
      createEntity('spawn', 'spawn'),
      presetVehicle('carrier', 'ship', [0, 1.2, 0]),
    ],
  }
  const sim = await session.play(document, { vehicleId: 'ship' })
  const view = { document, objects: new Map(), vehicleHeadOffset: () => undefined }
  const camera = new PerspectiveCamera(),
    state = createGameCameraState()
  state.mode = 'chase'
  // Angle between where the camera looks and the vehicle target; positive means above it.
  const lean = () => {
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const target = new Vector3(...sim.renderPlayerPosition)
      .add(new Vector3(0, state.settings.carrierTargetHeight, 0))
      .sub(camera.position)
      .normalize()
    return Math.asin(forward.y) - Math.asin(target.y)
  }
  let now = 1000
  const settle = () => {
    for (let i = 0; i < 80; i++) updateGameCamera(sim, view, camera, state, (now += 100), 0.1)
  }
  settle()
  expect(sim.vehicleInfo('ship').flightMode).toBe(false)
  expect(state.flightTilt).toBe(0)
  expect(Math.abs(lean())).toBeLessThan(1e-3)
  expect(sim.toggleFlight()).toContain('Modo vuelo')
  updateGameCamera(sim, view, camera, state, (now += 100), 0.1)
  // Eased in rather than snapped.
  expect(state.flightTilt).toBeGreaterThan(0)
  expect(state.flightTilt).toBeLessThan(state.settings.flightChaseTilt / 2)
  settle()
  expect(state.flightTilt).toBeCloseTo(state.settings.flightChaseTilt, 3)
  expect(lean()).toBeCloseTo(state.settings.flightChaseTilt, 2)
  // The driver view never carries the exterior flight tilt.
  state.mode = 'cockpit'
  updateGameCamera(sim, view, camera, state, (now += 100), 0.1)
  expect(state.flightTilt).toBe(0)
  session.dispose()
})
