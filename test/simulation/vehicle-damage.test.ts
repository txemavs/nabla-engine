import { expect, it } from 'vitest'
import { VehicleDamage } from '../../src/simulation/vehicle-damage.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import type { Vehicle } from '../../src/entity/vehicle/vehicle.js'

it('accumulates separate blows, aggregates simultaneous contacts and allows catastrophic impacts', () => {
  const damage = new VehicleDamage()
  damage.impact('car', 1, 25, 0)
  damage.impact('car', 2, 25, 0.1)
  expect(damage.remaining('car')).toBeCloseTo(93.4)
  for (let i = 1; i < 15; i++) damage.impact('car', i, 25, i)
  expect(damage.destroyed('car')).toBe(false)
  damage.impact('car', 20, 25, 16)
  expect(damage.destroyed('car')).toBe(true)
  damage.impact('truck', 1, 8, 0)
  damage.impact('truck', 2, 60, 0.1)
  expect(damage.destroyed('truck')).toBe(true)
  expect(damage.remaining('airborne')).toBe(100)
})

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
  damage.impact('car', 2, 2, 0)
  expect(damage.remaining('car')).toBe(100)
  damage.impact('car', 2, 17, 0)
  damage.impact('car', 2, 17, 0.1)
  expect(damage.remaining('car')).toBeCloseTo(95.8)
  damage.impact('car', 2, 17, 1.1)
  expect(damage.remaining('car')).toBeCloseTo(91.6)
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
    const shots = sim.consumeExplosions()
    expect(shots.map((event) => event.entityId)).toEqual(['car'])
    expect(shots[0]).toMatchObject({ cause: 'weapon', occupied: false })
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
    sim.startInVehicle('car')
    const vehicle = (sim as unknown as { vehicles: Map<string, Vehicle> }).vehicles.get('car')!
    vehicle.body.velocity.set(0, 0, -60)
    for (let i = 0; i < 20; i++) sim.step(1 / 60)
    expect(sim.vehicleDamage('car').destroyed).toBe(true)
    const impacts = sim.consumeExplosions()
    expect(impacts).toHaveLength(1)
    expect(impacts[0]).toMatchObject({ cause: 'impact', occupied: true })
  } finally {
    sim.dispose()
  }
})

it.each(['car', 'white-truck', 'vfr800'])(
  'an occupied %s ejects its avatar immediately on explosion',
  (preset) => {
    const sim = new Simulation({
      version: 1,
      name: 'Forced explosion exit',
      entities: [
        presetVehicle(preset, 'occupied', [0, 2, 0]),
        createEntity('spawn', 'spawn', [10, 2, 0]),
      ],
    })
    try {
      sim.startInVehicle('occupied')
      sim.damageVehicle('occupied', 100)
      expect(sim.player.vehicleId).toBeNull()
      expect(sim.playerEjection?.vehicleId).toBe('occupied')
      expect(sim.consumeExplosions()[0]).toMatchObject({ occupied: true, cause: 'weapon' })
      expect(sim.player.position[1]).toBeGreaterThan(sim.entityTransform('occupied').position[1])
      sim.damageVehicle('occupied', 100)
      expect(sim.consumeExplosions()).toHaveLength(0)
    } finally {
      sim.dispose()
    }
  },
)

it('a scaled blast pushes bodies in a proportionally smaller radius and only damages on request', () => {
  const sim = new Simulation({
    version: 1,
    name: 'Scaled blast',
    entities: [
      createEntity('spawn', 'spawn', [20, 1, 0]),
      presetVehicle('car', 'near', [1, 1, 0]),
      presetVehicle('car', 'mid', [5, 1, 0]),
    ],
  })
  try {
    const bodies = (id: string) =>
      (sim as unknown as { vehicles: Map<string, Vehicle> }).vehicles.get(id)!.body
    const push = (id: string) => bodies(id).velocity.length()
    sim.blast([0, 1, 0], 0.18)
    // 12 m × 0.18 = 2.2 m: the car 1 m away is pushed, the one 5 m away is not.
    expect(push('near')).toBeGreaterThan(0.1)
    expect(push('mid')).toBe(0)
    expect(sim.vehicleDamage('near').health).toBe(100)
    expect(sim.consumeExplosions()).toEqual([])
    // A full-size blast reaches the far car, with damage on request.
    sim.blast([0, 1, 0], 1, true)
    expect(push('mid')).toBeGreaterThan(0.1)
    expect(sim.vehicleDamage('mid').health).toBeLessThan(100)
    // Bad input does nothing.
    const before = push('near')
    sim.blast([Number.NaN, 0, 0], 1)
    sim.blast([0, 1, 0], 0)
    expect(push('near')).toBe(before)
  } finally {
    sim.dispose()
  }
})
