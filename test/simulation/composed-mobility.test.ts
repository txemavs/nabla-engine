import { expect, it, vi } from 'vitest'
import { Body, Box, Vec3, Quaternion, World } from '../../src/simulation/physics.js'
import { createBoat, stepBoatInWater } from '../../src/simulation/vehicles/boat.js'
import { createFlight, stepFlight } from '../../src/simulation/vehicles/flight.js'

it('floats and propels a standalone hull using injected water without wheels or a scene', () => {
  const world = new World()
  const body = new Body({
    mass: 1100,
    shape: new Box(new Vec3(1, 0.3, 2.75)),
    linearDamping: 0.01,
    angularDamping: 0.35,
  })
  world.addBody(body)
  const boat = createBoat(body)
  let level = 0
  const water = { sample: (keel: Vec3) => ({ up: new Vec3(0, 1, 0), depth: level - keel.y }) }
  const tick = (n: number, forward = 0) => {
    for (let i = 0; i < n; i++) {
      stepBoatInWater(boat, { forward, right: 0, brake: false }, water, 1 / 60)
      world.step(1 / 60)
    }
  }
  try {
    tick(240)
    const baseline = body.position.y
    level = 2
    tick(360)
    expect(body.position.y - baseline).toBeCloseTo(2, 1)
    tick(300, 1)
    expect(body.velocity.z).toBeLessThan(-5)
    expect(world.vehicles.size).toBe(0)
  } finally {
    world.removeBody(body)
    world.raw.free()
  }
})

it('shares flight assistance with injected cargo once and does not step or own the world', () => {
  const world = new World()
  const body = new Body({
    mass: 1000,
    shape: new Box(new Vec3(1, 1, 1)),
    position: new Vec3(0, 20, 0),
  })
  const cargo = new Body({
    mass: 500,
    shape: new Box(new Vec3(1, 1, 1)),
    position: new Vec3(5, 20, 0),
  })
  world.addBody(body)
  world.addBody(cargo)
  const bodyForce = vi.spyOn(body, 'applyForce')
  const cargoForce = vi.spyOn(cargo, 'applyForce')
  const flight = createFlight(body, 20)
  const environment = {
    height: 20,
    up: new Vec3(0, 1, 0),
    tangent: new Quaternion(),
    minimumAltitude: 0,
    planetary: false,
    cargo: [cargo, cargo, body],
  }
  try {
    stepFlight(flight, { forward: 0, right: 0, brake: false }, environment, 1 / 60)
    expect(body.position.y).toBe(20)
    expect(bodyForce).toHaveBeenCalledTimes(1)
    expect(bodyForce.mock.calls[0][0].y / body.mass).toBeCloseTo(9.81)
    expect(cargoForce).toHaveBeenCalledTimes(1)
    expect(cargoForce.mock.calls[0][0].y / cargo.mass).toBeCloseTo(9.81)
    world.step(1 / 60)
    expect(body.position.y).toBeCloseTo(20)
    expect(world.vehicles.size).toBe(0)
    expect(() =>
      stepFlight(flight, { forward: 0, right: 0, brake: false }, environment, NaN),
    ).toThrow()
  } finally {
    world.removeBody(body)
    world.removeBody(cargo)
    world.raw.free()
  }
})
