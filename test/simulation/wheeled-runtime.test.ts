import { expect, it } from 'vitest'
import { Body, Box, Vec3, World } from '../../src/simulation/physics.js'
import {
  createWheeledVehicle,
  stepWheeledVehicle,
  idleWheeledInput,
  wheelContacts,
  wheeledTelemetry,
  syncWheeledDamping,
  shiftWheeledVehicle,
  automaticWheeledTransmission,
  enterWheeledVehicle,
  type WheeledDefinition,
} from '../../src/simulation/vehicles/wheeled/index.js'

const definition = (): WheeledDefinition => ({
  hubs: [
    [-0.72, -0.2, -1.1],
    [0.72, -0.2, -1.1],
    [-0.72, -0.2, 1.1],
    [0.72, -0.2, 1.1],
  ],
  wheelRadius: 0.32,
  suspensionRest: 0.2,
  stiffness: 35,
  engineForce: 2200,
  brakeForce: 50,
  drivenWheels: 'front',
  powertrain: {
    powerCv: 150,
    torqueNm: 250,
    ratios: [3.4, 2.1, 1.4, 1, 0.8],
    finalDrive: 3.8,
    grip: 4.5,
  },
})
const chassis = (x = 0) =>
  new Body({ mass: 900, position: new Vec3(x, 0.8, 0), shape: new Box(new Vec3(0.8, 0.25, 1.5)) })

it('reports reverse only after R engages, not on reverse input or backward rolling in D', () => {
  const car = createWheeledVehicle(chassis(), definition())
  const input = { ...idleWheeledInput(), throttle: -1 }
  expect(wheeledTelemetry(car, input, true).reversing).toBe(false)
  car.body.velocity.set(0, 0, 1)
  expect(wheeledTelemetry(car, input, true).reversing).toBe(false)
  car.drivetrain.gear = -1
  expect(wheeledTelemetry(car, idleWheeledInput(), true).reversing).toBe(true)
  expect(wheeledTelemetry(car, input, false).reversing).toBe(false)
})

it('drives two custom rigs in one Rapier world and can detach one without disturbing the other', () => {
  const world = new World()
  const floor = new Body({
    shape: new Box(new Vec3(500, 0.5, 500)),
    position: new Vec3(5000, -0.5, 0),
  })
  world.addBody(floor)
  const a = createWheeledVehicle(chassis(5000), definition())
  const b = createWheeledVehicle(chassis(5010), definition())
  a.raycast.addToWorld(world)
  b.raycast.addToWorld(world)
  world.rebase(a.body.position)
  const tick = (n: number, accelerating: boolean) => {
    const input = { ...idleWheeledInput(), throttle: accelerating ? 1 : 0 }
    for (let i = 0; i < n; i++) {
      if (a.body.world) stepWheeledVehicle(a, input, 1 / 60, accelerating)
      stepWheeledVehicle(b, input, 1 / 60, accelerating)
      world.step(1 / 60)
      for (let w = 0; w < 4; w++) b.raycast.updateWheelTransform(w)
    }
    return input
  }
  try {
    tick(180, false)
    const input = tick(120, true)
    expect(wheeledTelemetry(b, input, true).speedMps).toBeGreaterThan(10)
    const contacts = wheelContacts(b, input, true).filter((c) => c.isInContact)
    expect(contacts.length).toBeGreaterThan(0)
    for (const c of contacts) {
      expect(c.contactPoint![0]).toBeGreaterThan(4900)
      expect(Math.hypot(...c.contactNormal!)).toBeCloseTo(1, 6)
    }
    a.raycast.removeFromWorld(world)
    world.removeBody(a.body)
    expect(world.vehicles.size).toBe(1)
    expect(world.bodies).toHaveLength(2)
    const before = wheeledTelemetry(b, input, true).speedMps
    tick(60, true)
    expect(wheeledTelemetry(b, input, true).speedMps).toBeGreaterThan(before)
  } finally {
    if (a.raycast.controller) a.raycast.removeFromWorld(world)
    b.raycast.removeFromWorld(world)
    for (const body of [...world.bodies]) world.removeBody(body)
    world.raw.free()
  }
})
it('spawns in P: no drive force, full service brake occupied or not, W leaves P', () => {
  const car = createWheeledVehicle(chassis(), definition())
  expect([car.drivetrain.gear, car.drivetrain.parked]).toEqual([0, true])
  stepWheeledVehicle(car, idleWheeledInput(), 1 / 60)
  expect(car.raycast.wheelInfos.every((w) => w.engineForce === 0 && w.brake === 50)).toBe(true)
  stepWheeledVehicle(car, idleWheeledInput(), 1 / 60, false)
  expect(car.raycast.wheelInfos.every((w) => w.brake === 50)).toBe(true)
  // Entering runs the start-up: P is kept and the pedal is ignored until the engine runs.
  enterWheeledVehicle(car)
  expect(car.drivetrain.ignition).toBe('sweep')
  const pedal = { ...idleWheeledInput(), throttle: 1 }
  for (let i = 0; i < 115; i++) stepWheeledVehicle(car, pedal, 1 / 60)
  expect([car.drivetrain.gear, car.drivetrain.parked]).toEqual([0, true])
  for (let i = 0; i < 40; i++) stepWheeledVehicle(car, pedal, 1 / 60)
  expect(car.drivetrain.ignition).toBe('running')
  expect(car.drivetrain.gear).toBe(1)
  expect(car.raycast.wheelInfos.slice(0, 2).every((w) => w.engineForce > 0)).toBe(true)
})
it('applies the driven axle, power/occupancy gates and dock damping without scene data', () => {
  const car = createWheeledVehicle(chassis(), definition(), { parked: false })
  const input = { ...idleWheeledInput(), throttle: 1, steering: 1 }
  stepWheeledVehicle(car, input, 1 / 60)
  expect(car.raycast.wheelInfos.slice(0, 2).every((w) => w.engineForce > 0)).toBe(true)
  expect(car.raycast.wheelInfos.slice(2).every((w) => w.engineForce === 0)).toBe(true)
  expect(car.steer).toBeCloseTo(-0.03)
  stepWheeledVehicle(car, input, 1 / 60, true, false)
  expect(car.raycast.wheelInfos.every((w) => w.engineForce === 0)).toBe(true)
  stepWheeledVehicle(car, input, 1 / 60, false)
  expect(car.raycast.wheelInfos.every((w) => w.brake === 20)).toBe(true)
  syncWheeledDamping(car, 0.12)
  expect(car.body.linearDamping).toBe(0.12)
  syncWheeledDamping(car)
  expect(car.body.linearDamping).toBe(0)
})
it('normalizes copied contacts and suppresses invalid/airborne contacts and non-tyre effects', () => {
  const car = createWheeledVehicle(chassis(), definition())
  const wheel = car.raycast.wheelInfos[2]
  car.body.velocity.set(0, 0, -10)
  wheel.isInContact = true
  wheel.raycastResult.hitPointWorld.set(4, 0, 5)
  wheel.raycastResult.hitNormalWorld.set(0, 2, 0)
  const input = { ...idleWheeledInput(), handbrake: true }
  const snapshot = wheelContacts(car, input, true)[2]
  expect(snapshot.contactNormal).toEqual([0, 1, 0])
  expect(snapshot.slip).toBe(1)
  snapshot.contactPoint![0] = 99
  expect(wheel.raycastResult.hitPointWorld.x).toBe(4)
  expect(wheel.raycastResult.hitNormalWorld.y).toBe(2)
  expect(wheelContacts(car, input, true, false)[2].slip).toBe(0)
  wheel.raycastResult.hitNormalWorld.set(0, 0, 0)
  expect(wheelContacts(car, input, true)[2]).toMatchObject({
    isInContact: false,
    contactPoint: null,
    contactNormal: null,
    slip: 0,
  })
  wheel.isInContact = false
  expect(wheelContacts(car, input, true)[2].slip).toBe(0)
})
it('returns transmission domain results and rejects invalid commands before mutating state', () => {
  const car = createWheeledVehicle(chassis(), definition(), { parked: false })
  expect(shiftWheeledVehicle(car, 1)).toBe('shifted')
  expect(shiftWheeledVehicle(car, -1)).toBe('protected')
  expect(automaticWheeledTransmission(car)).toBe(true)
  expect(car.drivetrain.manual).toBe(false)
  const snapshot = structuredClone(car.drivetrain)
  expect(() => stepWheeledVehicle(car, { ...idleWheeledInput(), throttle: NaN }, 1 / 60)).toThrow()
  expect(car.drivetrain).toEqual(snapshot)
  stepWheeledVehicle(car, idleWheeledInput(), 0)
  expect(car.drivetrain).toEqual(snapshot)
  delete car.definition.powertrain
  expect(shiftWheeledVehicle(car, 1)).toBe('unavailable')
  expect(automaticWheeledTransmission(car)).toBe(false)
  expect(() => createWheeledVehicle(chassis(), { ...definition(), wheelRadius: 0 })).toThrow(
    'Invalid wheeled',
  )
})
