import { expect, it } from 'vitest'
import { VehicleDamage } from '../../src/simulation/vehicle-damage.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import type { Vehicle } from '../../src/entity/vehicle/vehicle.js'

it('accumulates real damage, ignores invalid damage, emits destruction only once', () => {
  const damage = new VehicleDamage()
  damage.apply('car', NaN)
  damage.apply('car', -10)
  expect(damage.remaining('car')).toBe(100)
  damage.apply('car', 60)
  expect(damage.destroyed('car')).toBe(false)
  damage.apply('car', 40)
  damage.apply('car', 100)
  expect(damage.drain()).toEqual(['car'])
  expect(damage.drain()).toEqual([])
})

it('ignores gentle contacts and prevents sustained collision damage every frame', () => {
  const damage = new VehicleDamage()
  damage.impact('car', 2, 5, 0)
  expect(damage.remaining('car')).toBe(100)
  damage.impact('car', 2, 17, 0)
  damage.impact('car', 2, 17, 0.1)
  expect(damage.remaining('car')).toBe(65)
  damage.impact('car', 2, 17, 1.1)
  expect(damage.remaining('car')).toBe(30)
})

it('blast moves nearby bodies, cannot damage distant vehicles, and wreck cannot restart', () => {
  const sim = new Simulation({
    version: 1,
    name: 'Blast',
    entities: [
      createEntity('spawn', 'spawn', [4, 1, 0]),
      presetVehicle('car', 'car', [0, 1, 0]),
      presetVehicle('car', 'near', [5, 1, 0]),
      presetVehicle('car', 'far', [30, 1, 0]),
    ],
  })
  try {
    sim.damageVehicle('car', 50)
    expect(sim.consumeExplosions()).toEqual([])
    sim.damageVehicle('car', 50)
    expect(sim.consumeExplosions().map((event) => event.entityId)).toEqual(['car'])
    expect(sim.vehicleDamage('near').health).toBeLessThan(100)
    expect(sim.vehicleDamage('far').health).toBe(100)
    const before = sim.entityTransform('near').position
    sim.setInput({ ...idleInput(), forward: 1 })
    for (let i = 0; i < 5; i++) sim.step(1 / 60)
    expect(sim.entityTransform('near').position).not.toEqual(before)
    expect(sim.vehicleInfo('car').rpm).toBe(0)
    expect(() => sim.startInVehicle('car')).toThrow()
    sim.damageVehicle('car', 100)
    expect(sim.consumeExplosions()).toEqual([])
  } finally {
    sim.dispose()
  }
})

it('a strong physical collision destroys a vehicle, without requiring a gun hit', () => {
  const wall = createEntity('wall', 'box', [0, 1, -5])
  wall.size = [10, 8, 1]
  const sim = new Simulation(
    {
      version: 1,
      name: 'Impact',
      entities: [
        wall,
        presetVehicle('car', 'car', [0, 1, 0]),
        createEntity('spawn', 'spawn', [30, 1, 0]),
      ],
    },
    { vehicleDamage: true },
  )
  try {
    const vehicle = (sim as unknown as { vehicles: Map<string, Vehicle> }).vehicles.get('car')!
    vehicle.body.velocity.set(0, 0, -32)
    for (let i = 0; i < 20; i++) sim.step(1 / 60)
    expect(sim.vehicleDamage('car').destroyed).toBe(true)
    expect(sim.consumeExplosions()).toHaveLength(1)
  } finally {
    sim.dispose()
  }
})
