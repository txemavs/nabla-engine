import { expect, it } from 'vitest'
import { Body, Box, Vec3, World } from '../../src/simulation/physics.js'
import { createWheeledVehicle } from '../../src/simulation/vehicles/wheeled/runtime.js'
import { stepWheelMomentum } from '../../src/simulation/vehicles/wheel-momentum.js'
import { stepJumpControl } from '../../src/simulation/vehicles/jump-control.js'
import { idleWheeledInput } from '../../src/simulation/vehicles/wheeled/contracts.js'

function rig() {
  const world = new World()
  world.gravity.set(0, 0, 0)
  const body = new Body({ mass: 900, shape: new Box(new Vec3(0.8, 0.25, 1.5)) })
  const v = createWheeledVehicle(
    body,
    {
      hubs: [
        [-0.7, 0, -1],
        [0.7, 0, -1],
        [-0.7, 0, 1],
        [0.7, 0, 1],
      ],
      wheelRadius: 0.32,
      suspensionRest: 0.2,
      stiffness: 35,
      engineForce: 2200,
      brakeForce: 50,
      drivenWheels: 'rear',
    },
    { parked: false },
  )
  v.raycast.addToWorld(world)
  return { world, body, v }
}

it('permits sustained jump orientation without linear thrust and leaves inactive vehicles alone', () => {
  const { world, body, v } = rig()
  try {
    const input = { ...idleWheeledInput(), throttle: 1, steering: 1 }
    stepJumpControl(v, input, false)
    world.step(1 / 60)
    expect(body.angularVelocity.length()).toBeCloseTo(0)
    for (let i = 0; i < 30; i++) {
      stepJumpControl(v, input, true)
      world.step(1 / 60)
    }
    expect(body.angularVelocity.x).toBeGreaterThan(0.2)
    expect(body.angularVelocity.y).toBeLessThan(-0.05)
    expect(body.angularVelocity.z).toBeLessThan(-0.05)
    expect(body.velocity.length()).toBeCloseTo(0, 6)
    const before = body.angularVelocity.clone()
    stepJumpControl(v, idleWheeledInput(), true)
    expect([body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z]).toEqual([
      before.x,
      before.y,
      before.z,
    ])
  } finally {
    v.raycast.removeFromWorld(world)
    world.removeBody(body)
    world.raw.free()
  }
})

it('never applies jump assistance while any tyre touches the ground', () => {
  const { world, body, v } = rig()
  try {
    // Use the authoritative controller contact, rather than stale visual wheel state.
    v.raycast.controller!.wheelIsInContact = () => true
    stepJumpControl(v, { ...idleWheeledInput(), throttle: 1, steering: 1 }, true)
    world.step(1 / 60)
    expect(body.angularVelocity.length()).toBeCloseTo(0)
  } finally {
    v.raycast.removeFromWorld(world)
    world.removeBody(body)
    world.raw.free()
  }
})

it('exchanges wheel momentum for chassis pitch without translating an airborne vehicle', () => {
  const { world, body, v } = rig()
  try {
    v.raycast.wheelInfos[2].engineForce = 1100
    v.raycast.wheelInfos[3].engineForce = 1100
    for (let i = 0; i < 12; i++) {
      stepWheelMomentum(v, 1 / 60, true, true, 1)
      world.step(1 / 60)
    }
    expect(body.angularVelocity.x).toBeGreaterThan(0.05)
    expect(body.velocity.length()).toBeCloseTo(0, 6)
    const raised = body.angularVelocity.x
    for (const wheel of v.raycast.wheelInfos) {
      wheel.engineForce = 0
      wheel.brake = 50
    }
    for (let i = 0; i < 12; i++) {
      stepWheelMomentum(v, 1 / 60, true, false, 0)
      world.step(1 / 60)
    }
    expect(body.angularVelocity.x).toBeLessThan(raised * 0.15)
    const stopped = body.angularVelocity.x
    for (let i = 0; i < 60; i++) {
      stepWheelMomentum(v, 1 / 60, true, false, 0)
      world.step(1 / 60)
    }
    expect(Math.abs(body.angularVelocity.x)).toBeLessThan(Math.abs(stopped) + 0.002)
  } finally {
    v.raycast.removeFromWorld(world)
    world.removeBody(body)
    world.raw.free()
  }
})

it('braking spinning wheels lowers the nose, but braking stationary wheels adds no rotation', () => {
  const run = (speed: number) => {
    const { world, body, v } = rig()
    try {
      body.velocity.set(0, 0, -speed)
      for (const wheel of v.raycast.wheelInfos) wheel.brake = 50
      for (let i = 0; i < 12; i++) {
        stepWheelMomentum(v, 1 / 60, true, false, 0)
        world.step(1 / 60)
      }
      return body.angularVelocity.x
    } finally {
      v.raycast.removeFromWorld(world)
      world.removeBody(body)
      world.raw.free()
    }
  }
  expect(run(20)).toBeLessThan(-0.1)
  expect(run(0)).toBeCloseTo(0, 6)
})
