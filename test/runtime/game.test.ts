import { expect, it } from 'vitest'
import { GameplayCoordinator, GameRuntime } from '../../src/runtime/game.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { idleInput } from '../../src/simulation/simulation.js'
import type { SceneDocument } from '../../src/scene/document.js'
import { playGroundClearance } from '../../src/runtime/placement.js'
import { START_UP_SECONDS } from '../start-up.js'
import { PerspectiveCamera } from 'three'

const scene = (): SceneDocument => ({
  version: 1,
  name: 'Shared game',
  entities: [
    createEntity('spawn', 'spawn', [2.5, 0.1, 0]),
    { ...createEntity('floor', 'box', [0, -0.5, 0]), size: [200, 1, 200] },
    presetVehicle('car', 'car', [0, 0.7, 0]),
  ],
})
it('keeps interaction on foot until the authority gate grants entry; exit stays available', async () => {
  const game = new GameRuntime()
  try {
    await game.play(scene())
    for (let i = 0; i < 120; i++) game.step(1 / 60, idleInput(), 0, (i * 1000) / 60)
    game.vehicleEntryAllowed = () => false
    expect(game.dispatch('interact')).toContain('Esperando')
    expect(game.simulation!.player.vehicleId).toBeNull()
    game.vehicleEntryAllowed = () => true
    expect(game.dispatch('interact')).toContain('Conduciendo')
    game.vehicleEntryAllowed = () => false
    game.dispatch('interact')
    expect(game.simulation!.player.vehicleId).toBeNull()
  } finally {
    game.dispose()
  }
})
it('authority loss detaches from a moving vehicle without relocating or stopping it', async () => {
  const game = new GameRuntime()
  try {
    await game.play(scene(), { vehicleId: 'car' })
    const sim = game.simulation!
    sim.setEntityKinematic('car', true)
    sim.moveKinematicEntity(
      'car',
      { position: [10, 2, 0], rotation: [0, 0, 0, 1] },
      [15, 0, 0],
      [0, 0, 0],
    )
    const pose = sim.entityTransform('car')
    const velocity = sim.entityVelocity('car')
    sim.leaveVehicleAt([13, 2, 0])
    expect(sim.player.vehicleId).toBeNull()
    expect(sim.player.position).toEqual([13, 2, 0])
    expect(sim.entityTransform('car')).toEqual(pose)
    expect(sim.entityVelocity('car')).toEqual(velocity)
    sim.leaveVehicleAt([14, 2, 0])
    expect(sim.player.position).toEqual([14, 2, 0])
  } finally {
    game.dispose()
  }
})
it('climbs with the same shared flight action and input used by browser hosts', async () => {
  const game = new GameRuntime(),
    doc = scene()
  doc.entities[2] = presetVehicle('carrier', 'car', [20, 1.2, 0])
  doc.entities[2].transform.position[1] = playGroundClearance(doc.entities[2])
  try {
    await game.play(doc, { vehicleId: 'car' })
    for (let i = 0; i < 180; i++) game.step(1 / 60, idleInput(), 0, (i * 1000) / 60)
    game.action('KeyV')
    game.action('KeyV')
    expect(game.action('KeyC')).toMatch(/Modo vuelo/)
    for (let i = 0; i < 180; i++) {
      const input = game.readInput(1 / 60, { keys: new Set(['KeyW']) })
      game.step(1 / 60, input, 0, 3000 + (i * 1000) / 60)
    }
    expect(game.simulation!.player.position[1]).toBeGreaterThan(30)
  } finally {
    game.dispose()
  }
})
it('shares boarding, camera actions and fresh scene restoration across hosts', async () => {
  const game = new GameRuntime(),
    doc = scene(),
    original = structuredClone(doc)
  try {
    await game.play(doc)
    for (let i = 0; i < 120; i++) game.step(1 / 60, idleInput(), 0, (i * 1000) / 60)
    expect(game.action('KeyE')).toMatch(/Conduciendo/)
    game.step(1 / 60, idleInput(), 0, 2100)
    expect(game.cameraState.mode).toBe('cockpit')
    expect(game.cameraState.entrance).toBeNull()
    game.action('KeyE')
    game.step(1 / 60, idleInput(), 0, 2200)
    expect(game.simulation!.player.vehicleId).toBeNull()
    expect(game.action('KeyE')).toMatch(/Conduciendo/)
    game.step(1 / 60, idleInput(), 0, 2300)
    expect(game.cameraState.mode).toBe('cockpit')
    expect(game.cameraState.entrance).toBeNull()
    game.action('KeyV')
    expect(game.cameraState.mode).toBe('chase')
    expect(game.action('KeyV')).toMatch(/Overhead camera/)
    expect(game.cameraState.mode).toBe('map')
    // Re-entering runs the start-up (cranking, needle sweep) in P before W can select D.
    for (let i = 0; i < Math.ceil((START_UP_SECONDS + 2) * 60); i++)
      game.step(1 / 60, { ...idleInput(), forward: 1 }, 0, 2200 + (i * 1000) / 60)
    expect(game.simulation!.player.speed).toBeGreaterThan(1)
    expect(game.cameraState.entrance).toBeNull()
    game.stop()
    expect(game.simulation).toBeNull()
    expect(doc).toEqual(original)
    await game.play(doc)
    expect(game.simulation!.player.vehicleId).toBeNull()
    expect(game.simulation!.entityTransform('car').position).toEqual(
      original.entities[2].transform.position,
    )
  } finally {
    game.dispose()
  }
})
it('never starts an overhead descent when boarding, including a new vehicle', async () => {
  const game = new GameRuntime(),
    doc = scene()
  doc.entities.push(presetVehicle('car', 'car-2', [0, 0.7, -6]))
  try {
    await game.play(doc)
    for (let i = 0; i < 120; i++) game.step(1 / 60, idleInput(), 0, (i * 1000) / 60)
    game.simulation!.startInVehicle('car')
    game.step(1 / 60, idleInput(), 0, 2100)
    expect(game.cameraState.entrance).toBeNull()
    expect(game.action('KeyE')).toMatch(/pie|Monitor/)
    game.step(1 / 60, idleInput(), 0, 2200)
    game.simulation!.startInVehicle('car-2')
    game.step(1 / 60, idleInput(), 0, 2300)
    expect(game.cameraState.entrance).toBeNull()
    expect(game.action('KeyE')).toMatch(/pie|Monitor/)
    game.step(1 / 60, idleInput(), 0, 2400)
    game.simulation!.startInVehicle('car-2')
    game.step(1 / 60, idleInput(), 0, 2500)
    expect(game.cameraState.mode).toBe('cockpit')
    expect(game.cameraState.entrance).toBeNull()
  } finally {
    game.dispose()
  }
})
it('boards at eye level and turns toward the exit without cutting in first person', async () => {
  const game = new GameRuntime(),
    doc = scene()
  const camera = new PerspectiveCamera()
  const view = { document: doc, objects: new Map(), vehicleHeadOffset: () => undefined }
  try {
    await game.play(doc)
    for (let i = 0; i < 120; i++) game.step(1 / 60, idleInput(), 0, (i * 1000) / 60)
    game.updateCamera(view, camera, 2000, 1 / 60)
    const outside = camera.position.clone()
    game.action('KeyE')
    game.step(1 / 60, idleInput(), 0, 2100)
    game.updateCamera(view, camera, 2100, 1 / 60)
    expect(camera.position.distanceTo(outside)).toBeLessThan(0.001)
    expect(game.cameraState.entrance).toBeNull()
    game.updateCamera(view, camera, 2500, 1 / 60)
    expect(camera.position.distanceTo(outside)).toBeGreaterThan(0.1)
    expect(camera.position.y).toBeLessThan(3)
    game.updateCamera(view, camera, 2950, 1 / 60)
    const seated = camera.position.clone(),
      heading = camera.quaternion.clone()
    game.action('KeyE')
    game.step(1 / 60, idleInput(), 0, 3100)
    game.updateCamera(view, camera, 3100, 1 / 60)
    expect(game.cameraState.firstPerson).toBe(true)
    expect(camera.position.distanceTo(seated)).toBeLessThan(0.001)
    game.updateCamera(view, camera, 3350, 1 / 60)
    expect(camera.quaternion.angleTo(heading)).toBeGreaterThan(0.3)
    expect(camera.position.distanceTo(seated)).toBeGreaterThan(0)
    game.updateCamera(view, camera, 3950, 1 / 60)
    expect(game.cameraState.seatMove).toBeNull()
    expect(game.simulation!.player.vehicleId).toBeNull()
  } finally {
    game.dispose()
  }
})

it('consumes jump on a physics tick and clears pending input when focus is released', async () => {
  const game = new GameRuntime()
  try {
    await game.play(scene())
    for (let i = 0; i < 120; i++) game.step(1 / 60, idleInput(), 0, (i * 1000) / 60)
    const height = game.simulation!.player.position[1]
    game.action('Space')
    game.step(0, idleInput(), 0, 2100)
    game.step(1 / 240, idleInput(), 0, 2104)
    game.step(1 / 60, idleInput(), 0, 2117)
    expect(game.simulation!.player.position[1]).toBeGreaterThan(height)
    game.keys.press('KeyW', false, 2200)
    game.releaseInput()
    expect(game.keys.values.size).toBe(0)
    game.pause()
    const before = game.simulation!.player.position
    game.step(1, { ...idleInput(), forward: 1 }, 0, 3000)
    expect(game.simulation!.player.position).toEqual(before)
  } finally {
    game.dispose()
  }
})

it('retains the exact legacy coordinator constructor', () => {
  expect(GameRuntime).toBe(GameplayCoordinator)
  const coordinator = new GameplayCoordinator()
  expect(coordinator).toBeInstanceOf(GameRuntime)
  coordinator.dispose()
})
