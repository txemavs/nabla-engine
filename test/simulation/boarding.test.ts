import { expect, it } from 'vitest'
import { Simulation } from '../../src/simulation/simulation.js'
import { createEntity, type Entity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { hasLocalPreset } from '../local-presets.js'

type Row = readonly [string, () => Entity, readonly [number, number, number]]
const rows: Row[] = (
  [
    ['boat', () => presetVehicle('boat', 'vehicle', [0, 0, 0]), [0, 1, 4.5]],
    ['ship', () => presetVehicle('carrier', 'vehicle', [0, 0, 0]), [0, 0, 6]],
    ['car', () => presetVehicle('car', 'vehicle', [0, 0, 0]), [2.5, 0, 0]],
  ] as Row[]
).filter(([name]) => name !== 'boat' || hasLocalPreset('boat'))

it.each(rows)(
  'boards %s from its perimeter using ordinary interaction',
  (_name, create, position) => {
    const sim = new Simulation({
      version: 1,
      name: 'Board',
      entities: [createEntity('spawn', 'spawn', [...position]), create()],
    })
    expect(sim.nearestVehicle()).toBe('vehicle')
    expect(sim.interact()).toContain('Conduciendo')
    expect(sim.player.vehicleId).toBe('vehicle')
    sim.dispose()
  },
)
it.skipIf(!hasLocalPreset('boat'))(
  'falls under gravity onto a floating boat, boards, dismounts onto the deck and boards again',
  () => {
    const sim = new Simulation(
      {
        version: 1,
        name: 'Boat',
        entities: [
          createEntity('spawn', 'spawn', [0, 5, 1.6]),
          presetVehicle('boat', 'boat', [0, 0.2, 0]),
        ],
      },
      { playerMode: 'walk', planetaryTerrain: true },
    )
    const initial = sim.player.position[1]
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    expect(sim.player.position[1]).toBeLessThan(initial - 2)
    expect(sim.player.position[1]).toBeGreaterThan(-1)
    expect(sim.nearestVehicle()).toBe('boat')
    sim.interact()
    expect(sim.player.vehicleId).toBe('boat')
    expect(sim.interact()).toContain('A bordo')
    expect(sim.player.vehicleId).toBeNull()
    for (let i = 0; i < 30; i++) sim.step(1 / 60)
    expect(sim.nearestVehicle()).toBe('boat')
    sim.interact()
    expect(sim.player.vehicleId).toBe('boat')
    sim.dispose()
  },
)
it.skipIf(!hasLocalPreset('boat'))('does not board a vehicle through a wall', () => {
  const sim = new Simulation({
    version: 1,
    name: 'Wall',
    entities: [
      createEntity('spawn', 'spawn', [3.5, 0, 0]),
      presetVehicle('boat', 'boat', [0, 0, 0]),
      { ...createEntity('wall', 'box', [2, 1, 0]), size: [0.3, 4, 10] },
    ],
  })
  sim.step(1 / 60)
  expect(sim.nearestVehicle()).toBeNull()
  expect(sim.interact()).toContain('Acércate')
  sim.dispose()
})
it.skipIf(!hasLocalPreset('boat'))('does not reach a remote vehicle', () => {
  const sim = new Simulation({
    version: 1,
    name: 'Far',
    entities: [
      createEntity('spawn', 'spawn', [0, 15, 0]),
      presetVehicle('boat', 'boat', [0, 0, 0]),
    ],
  })
  expect(sim.nearestVehicle()).toBeNull()
  sim.dispose()
})
