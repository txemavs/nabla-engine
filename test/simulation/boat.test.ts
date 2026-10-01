import { expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createCatalogEntities } from '../../src/catalog/palette.js'
import { createEntity } from '../../src/entity/schema.js'
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
      presetVehicle('boat', 'hull', [0, 2, 0]),
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
      presetVehicle('boat', 'hull', [0, 2, 0]),
    ],
  })
  for (let i = 0; i < 120; i++) sim.step(1 / 60)
  sim.startInVehicle('hull')
  sim.setInput({ ...idleInput(), forward: 1, right: 1 })
  for (let i = 0; i < 360; i++) sim.step(1 / 60)
  expect(sim.entityTransform('hull').position[0]).toBeGreaterThan(1)
  sim.dispose()
})

it('floats and drives at spherical sea level far from an elevated map origin', () => {
  const earth = 6371000,
    altitude = 125,
    x = 12000
  const seaY = Math.sqrt((earth + 0.08) ** 2 - x * x) - earth - altitude
  const sim = new Simulation(
    {
      version: 1,
      name: 'Offshore',
      geography: { latitude: 43.4, longitude: -1.8, altitude, imagery: 'offline', planetary: true },
      entities: [
        createEntity('spawn', 'spawn', [x, seaY + 5, 8]),
        presetVehicle('boat', 'hull', [x, seaY + 2, 0]),
      ],
    },
    { planetaryTerrain: true },
  )
  for (let i = 0; i < 240; i++) sim.step(1 / 60)
  sim.startInVehicle('hull')
  sim.setInput({ ...idleInput(), forward: 1 })
  for (let i = 0; i < 300; i++) sim.step(1 / 60)
  const p = sim.entityTransform('hull').position
  const level = Math.hypot(p[0], p[1] + earth + altitude, p[2]) - earth
  expect(level).toBeGreaterThan(-0.35)
  expect(level).toBeLessThan(0.7)
  expect(p[2]).toBeLessThan(-12)
  expect(sim.player.speed).toBeGreaterThan(8)
  sim.dispose()
})

it('buoyancy follows the selected flood level', () => {
  for (const level of [-5, 20, 50]) {
    const sim = new Simulation(
      {
        version: 1,
        name: 'Flood',
        geography: {
          latitude: 43.4,
          longitude: -1.8,
          altitude: 0,
          imagery: 'offline',
          planetary: true,
        },
        entities: [
          createEntity('spawn', 'spawn', [0, level + 5, 8]),
          presetVehicle('boat', 'hull', [0, level + 2, 0]),
        ],
      },
      { planetaryTerrain: true },
    )
    sim.setWaterLevel(level)
    for (let i = 0; i < 240; i++) sim.step(1 / 60)
    expect(sim.entityTransform('hull').position[1] - level).toBeGreaterThan(-0.35)
    expect(sim.entityTransform('hull').position[1] - level).toBeLessThan(0.45)
    sim.dispose()
  }
})
