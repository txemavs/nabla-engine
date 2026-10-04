import { expect, it } from 'vitest'
import { createDrivetrain, selectDriveDirection } from '../../src/simulation/vehicles/drivetrain.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { Body, Box, Vec3, World } from '../../src/simulation/physics.js'

it('requires one uninterrupted second near standstill and retains reverse at idle', () => {
  const state = createDrivetrain()
  for (let i = 0; i < 59; i++) expect(selectDriveDirection(state, 0, -1, 1 / 60)).toBe(true)
  expect(state.gear).toBe(1)
  selectDriveDirection(state, 0, 0, 1 / 60)
  for (let i = 0; i < 59; i++) selectDriveDirection(state, 0, -1, 1 / 60)
  expect(state.gear).toBe(1)
  selectDriveDirection(state, 0, -1, 1 / 60)
  expect(state.gear).toBe(-1)
  for (let i = 0; i < 120; i++) selectDriveDirection(state, 0, 0, 1 / 60)
  expect(state.gear).toBe(-1)
  for (let i = 0; i < 120; i++) selectDriveDirection(state, -5, 1, 1 / 60)
  expect(state.gear).toBe(-1)
  for (let i = 0; i < 60; i++) selectDriveDirection(state, 0, 1, 1 / 60)
  expect(state.gear).toBe(1)
})

it('includes displaced chassis mass in its rotational inertia without changing total mass', () => {
  const world = new World({ gravity: new Vec3() })
  try {
    const body = new Body({ mass: 2 })
    body.addShape(new Box(new Vec3(0.5, 0.5, 0.5)), new Vec3(0, 2, 0))
    world.addBody(body)
    expect(body.raw!.mass()).toBeCloseTo(2)
    expect(body.inertia.z).toBeCloseTo(8 + 1 / 3)
    expect(body.inertia.y).toBeCloseTo(1 / 3)
  } finally {
    world.raw.free()
  }
})

function convoy(wall = false, bump = false) {
  const tractor = presetVehicle('white-truck', 'truck', [0, 1.45, 0])
  const trailer = presetVehicle('white-trailer', 'trailer', [0, 1.45, 7.33])
  trailer.vehicle!.tow = {
    vehicleId: 'truck',
    hitch: tractor.vehicle!.hitch!,
    anchor: trailer.vehicle!.towAnchor!,
  }
  const ground = createEntity('floor', 'box', [0, -0.5, -4000])
  ground.size = [10000, 1, 10000]
  const obstacle = createEntity('wall', 'box', [0, 2, 18])
  obstacle.size = [8, 4, 1]
  const car = presetVehicle('car', 'car', [-5, 0.62, -1.4])
  car.transform.rotation = [0, -Math.SQRT1_2, 0, Math.SQRT1_2]
  const sim = new Simulation({
    version: 1,
    name: 'Convoy regression',
    entities: [
      ground,
      createEntity('spawn', 'spawn', [5, 1, 0]),
      tractor,
      trailer,
      ...(wall ? [obstacle] : []),
      ...(bump ? [car] : []),
    ],
  })
  for (let i = 0; i < 180; i++) sim.step(1 / 60)
  sim.startInVehicle(bump ? 'car' : 'truck')
  return sim
}

it('reaches a governed 120 km/h on level ground with the trailer attached', () => {
  const sim = convoy()
  try {
    expect(sim.vehicleInfo('truck').rpm).toBeGreaterThan(600)
    expect(sim.vehicleInfo('truck').engineLoad).toBe(0)
    sim.setInput({ ...idleInput(), forward: 1 })
    let maximum = 0
    for (let i = 0; i < 5400; i++) {
      sim.step(1 / 60)
      maximum = Math.max(maximum, sim.vehicleInfo('truck').speedKmh)
    }
    expect(maximum).toBeGreaterThan(119)
    expect(maximum).toBeLessThan(121)
    expect(sim.vehicleInfo('trailer').towVehicleId).toBe('truck')
    const q = sim.entityTransform('truck').rotation
    expect(1 - 2 * (q[0] ** 2 + q[2] ** 2)).toBeGreaterThan(0.99)
  } finally {
    sim.dispose()
  }
})

it('does not overturn the convoy when a car accelerates into its side from five metres', () => {
  const sim = convoy(false, true)
  try {
    sim.setInput({ ...idleInput(), forward: 1 })
    let upright = 1
    for (let i = 0; i < 360; i++) {
      sim.step(1 / 60)
      const q = sim.entityTransform('truck').rotation
      upright = Math.min(upright, 1 - 2 * (q[0] ** 2 + q[2] ** 2))
    }
    expect(upright).toBeGreaterThan(0.95)
  } finally {
    sim.dispose()
  }
})

it('keeps normal reversing attached but releases an overloaded kingpin against an obstacle', () => {
  for (const wall of [false, true]) {
    const sim = convoy(wall)
    try {
      sim.setInput({ ...idleInput(), forward: -1 })
      for (let i = 0; i < 300; i++) sim.step(1 / 60)
      expect(sim.vehicleInfo('trailer').towVehicleId).toBe(wall ? null : 'truck')
      if (wall) {
        sim.setInput({ ...idleInput(), forward: 1 })
        for (let i = 0; i < 600; i++) sim.step(1 / 60)
        expect(
          sim.entityTransform('trailer').position[2] - sim.entityTransform('truck').position[2],
        ).toBeGreaterThan(15)
        expect(sim.entityTransform('trailer').rotation[0]).not.toBeCloseTo(0, 2)
      }
    } finally {
      sim.dispose()
    }
  }
})
