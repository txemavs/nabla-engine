import { expect, it } from 'vitest'
import { createOutboard } from '../../src/catalog/boat.js'
import { createCatalogEntities } from '../../src/catalog/palette.js'
import { createEntity } from '../../src/stage/scene.js'
import { idleInput, Simulation } from '../../src/simulation/simulation.js'

it('floats a 6 m outboard and planes ahead under 400 CV', () => {
  const boat = createCatalogEntities('boat', 'boat', [0, 0, 8])[0]
  expect(boat.vehicle?.boat).toBe(true)
  expect(boat.mass).toBe(1100)
  expect(boat.size[2]).toBe(6)
  expect(boat.vehicle?.engineForce).toBe(16000)
  const sim = new Simulation({
    version: 1,
    name: 'Boat',
    entities: [
      { ...createEntity('ground', 'box', [0, -8, 0]), size: [400, 1, 400] },
      createEntity('spawn', 'spawn', [0, 1, -20]),
      createOutboard('hull', [0, 2, 0]),
    ],
  })
  for (let i = 0; i < 240; i++) sim.step(1 / 60)
  const afloat = sim.entityTransform('hull').position
  expect(afloat[1]).toBeGreaterThan(-0.35)
  expect(afloat[1]).toBeLessThan(0.45)
  sim.startInVehicle('hull')
  sim.setInput({ ...idleInput(), forward: 1 })
  for (let i = 0; i < 300; i++) sim.step(1 / 60)
  const moving = sim.entityTransform('hull').position
  expect(moving[2]).toBeLessThan(-12)
  expect(sim.player.speed).toBeGreaterThan(8)
  sim.dispose()
})

it('turns the outboard to the right when the helm is right', () => {
  const sim = new Simulation({
    version: 1,
    name: 'Boat helm',
    entities: [
      { ...createEntity('ground', 'box', [0, -8, 0]), size: [400, 1, 400] },
      createEntity('spawn', 'spawn', [0, 1, -20]),
      createOutboard('hull', [0, 2, 0]),
    ],
  })
  for (let i = 0; i < 120; i++) sim.step(1 / 60)
  sim.startInVehicle('hull')
  sim.setInput({ ...idleInput(), forward: 1, right: 1 })
  for (let i = 0; i < 360; i++) sim.step(1 / 60)
  expect(sim.entityTransform('hull').position[0]).toBeGreaterThan(1)
  sim.dispose()
})
