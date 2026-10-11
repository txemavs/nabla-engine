import { expect, test } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import {
  createGameCameraState,
  cycleGameCamera,
  gameCameraView,
  isFirstPersonView,
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
import { startEjection, type RiderEjection } from '../../src/simulation/rider-ejection.js'
import { Vec3 } from '../../src/simulation/physics.js'
import { idleInput } from '../../src/simulation/simulation.js'
import type { Vehicle } from '../../src/entity/vehicle/vehicle.js'

test.each(['chase', 'map', 'cinematic', 'cockpit'] as const)(
  'runtime preserves %s through actual falling, lifting and automatic boarding',
  async (mode) => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [100, 1, 100]
    const game = new GameRuntime()
    try {
      const sim = await game.play(
        {
          version: 1,
          name: 'Recovery view',
          entities: [
            floor,
            createEntity('spawn', 'spawn'),
            presetVehicle('vfr800', 'bike', [0, 0.6, 0]),
          ],
        },
        { vehicleId: 'bike' },
      )
      for (let i = 0; i < 60; i++) game.step(1 / 60, idleInput(), -100, (i * 1000) / 60)
      game.cameraState.mode = mode
      const bike = (sim as unknown as { vehicles: Map<string, Vehicle> }).vehicles.get('bike')!
      bike.body.quaternion.setFromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2)
      bike.body.velocity.setZero()
      bike.body.angularVelocity.setZero()
      let boarding = false
      for (let i = 0; i < 360; i++) {
        game.step(1 / 60, idleInput(), -100, 1000 + (i * 1000) / 60)
        boarding ||= sim.playerBikeRecovery?.phase === 'boarding'
        expect(game.cameraState.mode).toBe(mode)
        if (!sim.player.vehicleId) expect(game.cameraState.firstPerson).toBe(mode === 'cockpit')
      }
      expect(boarding).toBe(true)
      expect(sim.player.vehicleId).toBe('bike')
    } finally {
      game.dispose()
    }
  },
)

test('a fallen rider gets an overhead shot of rider and bike without losing the previous camera mode', async () => {
  const document: SceneDocument = {
    version: 1,
    name: 'Fall camera',
    entities: [
      presetVehicle('vfr800', 'bike', [0, 0.6, 0]),
      createEntity('spawn', 'spawn', [12, 1, 8]),
    ],
  }
  const session = new PlaySession()
  const sim = await session.play(document)
  const view = {
    document,
    objects: new Map(),
    vehicleHeadOffset: () => [0, 0, 0] as [number, number, number],
  }
  const camera = new PerspectiveCamera(38, 0.6)
  const state = createGameCameraState()
  state.mode = 'cockpit'
  const fall = sim as unknown as { ejection: RiderEjection | null }
  try {
    fall.ejection = startEjection('bike', 12)
    const result = updateGameCamera(sim, view, camera, state, 1000, 1 / 60)
    expect(result.cinematic).toBe(true)
    expect(result.cockpit).toBe(false)
    expect(camera.getWorldDirection(new Vector3()).y).toBeCloseTo(-1, 8)
    expect(state.mode).toBe('cockpit')
    camera.updateMatrixWorld(true)
    for (const centre of [sim.renderPlayerPosition, sim.entityTransform('bike').position]) {
      const projected = new Vector3(...centre).project(camera)
      expect(Math.abs(projected.x)).toBeLessThan(0.95)
      expect(Math.abs(projected.y)).toBeLessThan(0.95)
    }
    fall.ejection = null
    expect(updateGameCamera(sim, view, camera, state, 2000, 1 / 60).cinematic).toBe(false)
    // Getting up beside a tipped bike is not another ejection: keep every chosen mode.
    for (const mode of ['cockpit', 'chase', 'map', 'cinematic'] as const) {
      state.mode = mode
      for (const phase of ['rising', 'lifting', 'boarding'] as const) {
        Object.defineProperty(sim, 'playerBikeRecovery', {
          configurable: true,
          get: () => ({ vehicleId: 'bike', phase, progress: 0.5 }),
        })
        const recovering = updateGameCamera(sim, view, camera, state, 3000, 1 / 60)
        expect(recovering.cinematic).toBe(mode === 'cinematic')
        expect(recovering.cockpit).toBe(mode === 'cockpit')
        expect(state.lastView?.view).toBe(mode)
        expect(state.mode).toBe(mode)
      }
    }
  } finally {
    session.dispose()
  }
})

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
  // Each view's settled pose, frame-exact: cut between views (blends: camera-transitions.test.ts).
  const camera = new PerspectiveCamera(),
    state = createGameCameraState({ modeTransitionMs: 0 })
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
  // The vehicle overhead and cinematic views ignore mouse movement (wheel zoom only).
  for (const mode of ['map', 'cinematic'] as const) {
    state.mode = mode
    expect(mouseLooksWithoutButton(state, true)).toBe(false)
    // On foot the mouse keeps turning the walking heading.
    expect(mouseLooksWithoutButton(state, false)).toBe(true)
  }
})

test('C cycles exterior → driver → overhead → cinematic seated, and adds overhead/cinematic on foot', () => {
  const state = createGameCameraState()
  state.mode = 'chase'
  expect([1, 2, 3, 4].map(() => cycleGameCamera(state, true))).toEqual([
    'cockpit',
    'map',
    'cinematic',
    'chase',
  ])
  state.mode = 'chase'
  state.firstPerson = true
  expect(gameCameraView(state, false)).toBe('first-person')
  expect([1, 2, 3, 4].map(() => cycleGameCamera(state, false))).toEqual([
    'chase',
    'map',
    'cinematic',
    'first-person',
  ])
  expect(state.firstPerson).toBe(true)
  // Leaving a car keeps the mode it had; a leftover cockpit mode reads as on-foot first person.
  state.mode = 'cockpit'
  expect(gameCameraView(state, false)).toBe('first-person')
  expect(cycleGameCamera(state, false)).toBe('chase')
  // Entering cinematic starts the orbit behind the current heading.
  state.yaw = 1.2
  cycleGameCamera(state, false)
  cycleGameCamera(state, false)
  expect(state.mode).toBe('cinematic')
  expect(state.cinematicAngle).toBe(1.2)
})

test('overhead and cinematic views never count as first person', () => {
  const state = createGameCameraState()
  for (const mode of ['map', 'cinematic'] as const) {
    state.mode = mode
    state.firstPerson = true
    expect(isFirstPersonView(state, false)).toBe(false)
    expect(isFirstPersonView(state, true)).toBe(false)
  }
  state.mode = 'chase'
  expect(isFirstPersonView(state, false)).toBe(true)
  state.mode = 'cockpit'
  expect(isFirstPersonView(state, true)).toBe(true)
})

test('on-foot overhead looks straight down, heading-up, with wheel-adjustable height', async () => {
  const session = new PlaySession()
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [200, 1, 200]
  const document: SceneDocument = {
    version: 1,
    name: 'Foot overhead',
    entities: [floor, createEntity('spawn', 'spawn', [3, 0.1, -2])],
  }
  const sim = await session.play(document)
  const view = { document, objects: new Map(), vehicleHeadOffset: () => undefined }
  const camera = new PerspectiveCamera()
  const state = createGameCameraState()
  state.mode = 'map'
  state.yaw = Math.PI / 2 // facing −X
  let now = 1000
  const settle = () => {
    for (let i = 0; i < 60; i++) updateGameCamera(sim, view, camera, state, (now += 100), 0.1)
  }
  settle()
  const player = new Vector3(...sim.renderPlayerPosition)
  expect(camera.position.x).toBeCloseTo(player.x, 3)
  expect(camera.position.z).toBeCloseTo(player.z, 3)
  expect(camera.position.y - player.y).toBeCloseTo(state.settings.footMapHeight, 0)
  const look = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  expect(look.y).toBeCloseTo(-1, 5)
  // Screen top points along the walking heading.
  const screenUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
  expect(screenUp.x).toBeCloseTo(-1, 3)
  expect(camera.fov).toBe(state.settings.chaseFov)
  state.mapZoom = 3
  settle()
  expect(camera.position.y - player.y).toBeCloseTo(state.settings.footMapHeight * 3, 0)
  state.mapZoom = 0.75
  settle()
  expect(camera.position.y - player.y).toBeCloseTo(state.settings.footMapHeight * 0.75, 0)
  session.dispose()
})

test('cinematic camera orbits slowly around the vehicle and keeps it framed', async () => {
  const session = new PlaySession()
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [400, 1, 400]
  const document: SceneDocument = {
    version: 1,
    name: 'Cinematic',
    entities: [floor, createEntity('spawn', 'spawn'), presetVehicle('car', 'car', [0, 0.7, 0])],
  }
  const sim = await session.play(document, { vehicleId: 'car' })
  const view = { document, objects: new Map(), vehicleHeadOffset: () => undefined }
  const camera = new PerspectiveCamera()
  const state = createGameCameraState()
  state.mode = 'chase'
  cycleGameCamera(state, true)
  cycleGameCamera(state, true)
  expect(cycleGameCamera(state, true)).toBe('cinematic')
  const start = state.cinematicAngle
  const result = updateGameCamera(sim, view, camera, state, 1000, 1 / 60)
  expect(result.cinematic).toBe(true)
  expect(camera.fov).toBe(state.settings.cinematicFov)
  const target = new Vector3(...sim.renderPlayerPosition)
  const flat = camera.position.clone().sub(target).setY(0).length()
  expect(flat).toBeGreaterThanOrEqual(state.settings.cinematicMinDistance - 0.5)
  expect(camera.position.y).toBeGreaterThan(target.y + 1)
  // The vehicle sits at the centre of the frame.
  const look = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  const toCar = target
    .clone()
    .add(new Vector3(0, state.settings.targetHeight, 0))
    .sub(camera.position)
    .normalize()
  expect(look.angleTo(toCar)).toBeLessThan(0.05)
  // Ten seconds advance the orbit by 10 / cinematicOrbitSeconds of a turn.
  for (let i = 0; i < 100; i++) updateGameCamera(sim, view, camera, state, 1000 + i * 100, 0.1)
  const turned = state.cinematicAngle - start
  expect(turned).toBeCloseTo((10 / state.settings.cinematicOrbitSeconds) * Math.PI * 2, 1)
  // Leaving the mode drops the smoothed anchor so the next shot re-seeds without a jump.
  state.mode = 'chase'
  updateGameCamera(sim, view, camera, state, 20000, 1 / 60)
  expect(state.cinematicAnchorY).toBeNull()
  session.dispose()
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

test('cockpit and chase views ride the smoothed vehicle (SceneView.rideSmoothing)', async () => {
  const { RideSmoothing } = await import('../../src/render/entity/ride-smoothing.js')
  const session = new PlaySession()
  const document: SceneDocument = {
    version: 1,
    name: 'Ride smoothing',
    entities: [createEntity('spawn', 'spawn'), presetVehicle('car', 'car', [0, 2, 0])],
  }
  const sim = await session.play(document, { vehicleId: 'car' })
  const plain = { document, objects: new Map(), vehicleHeadOffset: () => undefined }
  // The body has just bounced 3 cm up; the smoothed vehicle is still 3 cm lower.
  const rideSmoothing = new RideSmoothing()
  rideSmoothing.id = 'car'
  rideSmoothing.raw.fromArray(sim.entityTransform('car', true).position)
  rideSmoothing.position.copy(rideSmoothing.raw).add(new Vector3(0, -0.03, 0))
  const smoothed = { ...plain, rideSmoothing }
  for (const mode of ['cockpit', 'chase'] as const) {
    const pose = (view: typeof plain) => {
      const camera = new PerspectiveCamera()
      const state = createGameCameraState({ modeTransitionMs: 0 })
      state.mode = mode
      updateGameCamera(sim, view, camera, state, 1000, 1 / 60)
      return camera.position.clone()
    }
    const drop = pose(plain).sub(pose(smoothed))
    expect(drop.y).toBeCloseTo(0.03, 3)
    expect(Math.hypot(drop.x, drop.z)).toBeLessThan(1e-3)
  }
  session.dispose()
})
