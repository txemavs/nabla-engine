import { expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createCatalogEntities } from '../../src/catalog/palette.js'
import { createEntity } from '../../src/entity/schema.js'
import { idleInput, Simulation } from '../../src/simulation/simulation.js'

it('lifts a Cessna off the runway in plane mode', () => {
  const plane = createCatalogEntities('cessna', 'cessna', [0, 0, 8])[0]
  expect(plane.vehicle?.flight).toBe(true)
  expect(plane.vehicle?.plane).toBe(true)
  expect(plane.mass).toBe(1000)
  expect(plane.size[0]).toBe(11)
  const sim = new Simulation({
    version: 1,
    name: 'Cessna',
    entities: [
      { ...createEntity('ground', 'box', [0, -0.5, 0]), size: [1200, 1, 1200] },
      createEntity('spawn', 'spawn', [0, 1, -30]),
      presetVehicle('cessna', 'hull', [0, 0.95, 0]),
    ],
  })
  for (let i = 0; i < 90; i++) sim.step(1 / 60)
  const parked = sim.entityTransform('hull').position[1]
  expect(parked).toBeGreaterThan(0.5)
  expect(parked).toBeLessThan(1.3)
  sim.startInVehicle('hull')
  expect(sim.vehicleInfo('hull').helm).toBe('plane')
  sim.setInput({ ...idleInput(), lift: 1, forward: -1 })
  for (let i = 0; i < 12 * 60; i++) sim.step(1 / 60)
  const flying = sim.entityTransform('hull').position
  expect(sim.player.speed).toBeGreaterThan(25)
  expect(flying[1]).toBeGreaterThan(3)
  expect(sim.vehicleInfo('hull').engine).toBeGreaterThan(0.5)
  sim.dispose()
})
