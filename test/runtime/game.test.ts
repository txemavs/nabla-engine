import { expect, it } from 'vitest'
import { GameRuntime } from '../../src/runtime/game.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { idleInput } from '../../src/simulation/simulation.js'
import type { SceneDocument } from '../../src/scene/document.js'
import { playGroundClearance } from '../../src/runtime/placement.js'

const scene = (): SceneDocument => ({
  version: 1,
  name: 'Shared game',
  entities: [
    createEntity('spawn', 'spawn', [2.5, 0.1, 0]),
    { ...createEntity('floor', 'box', [0, -0.5, 0]), size: [200, 1, 200] },
    presetVehicle('car', 'car', [0, 0.7, 0]),
  ],
})
it('climbs with the same shared flight action and input used by browser hosts', async () => {
  const game = new GameRuntime(),
    doc = scene()
  doc.entities[2] = presetVehicle('carrier', 'car', [20, 1.2, 0])
  doc.entities[2].transform.position[1] = playGroundClearance(doc.entities[2])
  try {
    await game.play(doc, { vehicleId: 'car' })
    for (let i = 0; i < 180; i++) game.step(1 / 60, idleInput(), 0, (i * 1000) / 60)
    game.action('KeyC')
    game.action('KeyC')
    expect(game.action('KeyV')).toMatch(/Modo vuelo/)
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
    expect(game.cameraState.entrance?.id).toBe('car')
    game.action('KeyE')
    game.step(1 / 60, idleInput(), 0, 2200)
    expect(game.simulation!.player.vehicleId).toBeNull()
    expect(game.action('KeyE')).toMatch(/Conduciendo/)
    game.step(1 / 60, idleInput(), 0, 2300)
    expect(game.cameraState.mode).toBe('cockpit')
    expect(game.cameraState.entrance).toBeNull()
    game.action('KeyC')
    expect(game.cameraState.mode).toBe('map')
    expect(game.action('KeyC')).toMatch(/Cinematic camera/)
    expect(game.cameraState.mode).toBe('cinematic')
    game.action('KeyC')
    expect(game.cameraState.mode).toBe('chase')
    for (let i = 0; i < 120; i++)
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
it('plays the boarding camera once per vehicle and reuses it on later enters', async () => {
  const game = new GameRuntime(),
    doc = scene()
  doc.entities.push(presetVehicle('car', 'car-2', [0, 0.7, -6]))
  try {
    await game.play(doc)
    for (let i = 0; i < 120; i++) game.step(1 / 60, idleInput(), 0, (i * 1000) / 60)
    game.simulation!.startInVehicle('car')
    game.step(1 / 60, idleInput(), 0, 2100)
    expect(game.cameraState.entrance?.id).toBe('car')
    expect(game.action('KeyE')).toMatch(/pie|Monitor/)
    game.step(1 / 60, idleInput(), 0, 2200)
    game.simulation!.startInVehicle('car-2')
    game.step(1 / 60, idleInput(), 0, 2300)
    expect(game.cameraState.entrance?.id).toBe('car-2')
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
