import { expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { EARTH_RADIUS } from '../../src/math/geo/sphere.js'
import { CATCH_FLOOR_DEPTH } from '../../src/planet/catch-floor.js'
import { Simulation } from '../../src/simulation/simulation.js'

function advance(sim: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.step(1 / 60)
}

function altitude(position: readonly [number, number, number], origin = 0): number {
  return (
    Math.hypot(position[0], position[1] + EARTH_RADIUS + origin, position[2]) -
    EARTH_RADIUS -
    origin
  )
}

function planet(entities: ReturnType<typeof createEntity>[], origin = 0) {
  return new Simulation(
    {
      version: 1,
      name: 'Hole',
      geography: {
        latitude: 43.4,
        longitude: -1.8,
        altitude: origin,
        imagery: 'offline',
        planetary: true,
      },
      entities,
    },
    { planetaryTerrain: true },
  )
}

it('stays absent while the actor is still above the sea', () => {
  const sim = planet([createEntity('spawn', 'spawn', [0, 8, 0])])
  sim.step(1 / 60)
  expect(sim.catchDisk()).toBeNull()
  sim.dispose()
})

it('ignores a hull sitting in the surface', () => {
  const sim = planet([createEntity('spawn', 'spawn', [0, -1.9, 0])])
  sim.step(1 / 60)
  expect(altitude(sim.player.position)).toBeLessThan(0)
  expect(sim.catchDisk()).toBeNull()
  sim.dispose()
})

it('puts a flat disk 30 m under the sea and stops the fall', () => {
  const sim = planet([createEntity('spawn', 'spawn', [0, 6, 0])])
  advance(sim, 6)
  const disk = sim.catchDisk()
  expect(disk).not.toBeNull()
  expect(altitude(disk!.position)).toBeCloseTo(-CATCH_FLOOR_DEPTH, 1)
  expect(altitude(sim.player.position)).toBeGreaterThan(-CATCH_FLOOR_DEPTH - 0.4)
  expect(altitude(sim.player.position)).toBeLessThan(-CATCH_FLOOR_DEPTH + 1.4)
  expect(sim.player.position[1]).toBeGreaterThan(-80)
  sim.dispose()
})

it('keeps the disk on the sea sphere far from the map origin', () => {
  const origin = 40
  const x = 12000
  const radius = EARTH_RADIUS - 8
  const y = Math.sqrt(radius * radius - x * x) - EARTH_RADIUS - origin
  const sim = planet([createEntity('spawn', 'spawn', [x, y, 0])], origin)
  sim.setWaterLevel(4)
  sim.step(1 / 60)
  const disk = sim.catchDisk()
  expect(disk).not.toBeNull()
  const top = EARTH_RADIUS + 4 - CATCH_FLOOR_DEPTH
  expect(
    Math.hypot(disk!.position[0], disk!.position[1] + EARTH_RADIUS + origin, disk!.position[2]),
  ).toBeCloseTo(top, 1)
  expect(disk!.position[0] / x).toBeCloseTo(1, 1)
  sim.dispose()
})

it('stops the occupied car on the same disk', () => {
  const sim = planet([
    createEntity('spawn', 'spawn', [0, 4, 6]),
    presetVehicle('car', 'car', [0, 4, 0]),
  ])
  sim.startInVehicle('car')
  advance(sim, 8)
  const disk = sim.catchDisk()
  expect(disk).not.toBeNull()
  expect(altitude(disk!.position)).toBeCloseTo(-CATCH_FLOOR_DEPTH, 1)
  expect(altitude(sim.player.position)).toBeGreaterThan(-CATCH_FLOOR_DEPTH - 1)
  expect(altitude(sim.player.position)).toBeLessThan(-CATCH_FLOOR_DEPTH + 3)
  sim.dispose()
})
