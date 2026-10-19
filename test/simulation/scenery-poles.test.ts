import { expect, it } from 'vitest'
import { Simulation } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { Body, Box, Vec3, type World } from '../../src/simulation/physics.js'
it.each([true, false])('nearby pole responds to a vehicle-mass impact, movable=%s', (movable) => {
  const sim = new Simulation(
    { version: 1, name: 'Pole impact', entities: [createEntity('spawn', 'spawn', [20, 1, 20])] },
    { playerMode: 'walk' },
  )
  const pole = sim.createSceneryPole([0, 1.5, 0], 3, movable)
  // Exercise real contacts rather than manually moving the sign transform.
  const world = (sim as unknown as { world: World }).world
  const car = new Body({
    mass: 1200,
    position: new Vec3(0, 0.7, 3),
    shape: new Box(new Vec3(0.8, 0.5, 1)),
  })
  car.velocity.set(0, 0, -15)
  world.addBody(car)
  for (let i = 0; i < 30; i++) world.step(1 / 60)
  if (movable) expect(Math.abs(pole.pose().position[2])).toBeGreaterThan(0.1)
  else expect(pole.pose().position).toEqual([0, 1.5, 0])
  pole.dispose()
  pole.dispose()
  sim.dispose()
})

it('leaves an upright sign dormant until contact', () => {
  const sim = new Simulation(
    { version: 1, name: 'Dormant pole', entities: [createEntity('spawn', 'spawn', [20, 1, 20])] },
    { playerMode: 'walk' },
  )
  const pole = sim.createSceneryPole([0, 1.5, 0], 3, true)
  const world = (sim as unknown as { world: World }).world
  for (let i = 0; i < 120; i++) world.step(1 / 60)
  expect(pole.pose().position).toEqual([0, 1.5, 0])
  pole.dispose()
  sim.dispose()
})

it('builds a static pole with its own half size and the solid surface', () => {
  const sim = new Simulation(
    { version: 1, name: 'Solid pole', entities: [createEntity('spawn', 'spawn', [20, 1, 20])] },
    { playerMode: 'walk' },
  )
  const world = (sim as unknown as { world: World }).world
  const before = world.bodies.length
  const pole = sim.createSceneryPole([0, 1.8, 0], 3.6, false, {
    half: [0.07, 1.8, 0.07],
    solid: true,
  })
  const body = world.bodies[world.bodies.length - 1]!
  expect(world.bodies.length).toBe(before + 1)
  expect(body.mass).toBe(0)
  expect((body.shapes[0] as Box).halfExtents.x).toBeCloseTo(0.07)
  expect((body.shapes[0] as Box).halfExtents.y).toBeCloseTo(1.8)
  const plain = sim.createSceneryPole([5, 1.5, 0], 3, false)
  const other = world.bodies[world.bodies.length - 1]!
  expect((other.shapes[0] as Box).halfExtents.x).toBeCloseTo(0.09)
  expect(other.material).not.toBe(body.material)
  expect(sim.sceneryActors().length).toBeGreaterThanOrEqual(1)
  pole.dispose()
  plain.dispose()
  sim.dispose()
})
