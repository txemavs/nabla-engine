/** Independent fixed-step host. No Simulation, Studio, renderer or stock vehicle preset. */
import assert from 'node:assert/strict'
import { initPhysics, World, Body, Box, Vec3 } from '@nabla/engine/physics'
import {
  createWheeledVehicle,
  stepWheeledVehicle,
  idleWheeledInput,
  wheeledTelemetry,
  wheelContacts,
  shiftWheeledVehicle,
  automaticWheeledTransmission,
} from '@nabla/engine/vehicles/wheeled'

await initPhysics()
const world = new World()
const floor = new Body({ shape: new Box(new Vec3(500, 0.5, 500)), position: new Vec3(0, -0.5, 0) })
world.addBody(floor)
const body = new Body({
  mass: 900,
  shape: new Box(new Vec3(0.8, 0.25, 1.5)),
  position: new Vec3(0, 0.8, 0),
})
const car = createWheeledVehicle(body, {
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
car.raycast.addToWorld(world)
const step = (input, ticks, active = true) => {
  for (let n = 0; n < ticks; n++) {
    stepWheeledVehicle(car, input, 1 / 60, active)
    world.step(1 / 60)
    // Refresh cached wheel transforms/contacts after the host-owned world tick.
    for (let i = 0; i < 4; i++) car.raycast.updateWheelTransform(i)
  }
}
try {
  step(idleWheeledInput(), 180, false)
  const input = { ...idleWheeledInput(), throttle: 1 }
  step(input, 180)
  const accelerated = wheeledTelemetry(car, input, true)
  assert(accelerated.speedMps > 10)
  assert(
    wheelContacts(car, input, true).some(
      (c) => c.contactNormal && Math.abs(Math.hypot(...c.contactNormal) - 1) < 1e-6,
    ),
  )
  shiftWheeledVehicle(car, -1)
  step(idleWheeledInput(), 120)
  const retained = wheeledTelemetry(car, idleWheeledInput(), true)
  assert(retained.manualTransmission)
  assert(retained.speedMps < accelerated.speedMps)
  assert(automaticWheeledTransmission(car))
  assert.equal(typeof globalThis.document, 'undefined')
  console.log(
    JSON.stringify({
      example: 'independent wheeled runtime',
      acceleratedMps: accelerated.speedMps,
      retainedMps: retained.speedMps,
      bodies: world.bodies.length,
    }),
  )
} finally {
  car.raycast.removeFromWorld(world)
  for (const body of [...world.bodies]) world.removeBody(body)
  world.raw.free()
}
