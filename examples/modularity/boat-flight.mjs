/** One host-owned world; no entities, car definitions or renderer. */
import assert from 'node:assert/strict'
import { initPhysics, World, Body, Box, Vec3, Quaternion } from '@nabla/engine/physics'
import { createBoat, stepBoatInWater } from '@nabla/engine/vehicles/boat'
import { createFlight, stepFlight } from '@nabla/engine/vehicles/flight'
await initPhysics()
const world = new World()
const hull = new Body({
  mass: 1100,
  shape: new Box(new Vec3(1, 0.3, 2.75)),
  linearDamping: 0.01,
  angularDamping: 0.35,
})
const airframe = new Body({
  mass: 1000,
  shape: new Box(new Vec3(1, 1, 2)),
  position: new Vec3(20, 30, 0),
})
world.addBody(hull)
world.addBody(airframe)
const boat = createBoat(hull)
const flight = createFlight(airframe, 30)
const water = { sample: (keel) => ({ up: new Vec3(0, 1, 0), depth: -keel.y }) }
try {
  for (let i = 0; i < 600; i++) {
    stepBoatInWater(boat, { forward: i > 240 ? 1 : 0, right: 0, brake: false }, water, 1 / 60)
    stepFlight(
      flight,
      { forward: 0, right: 0, brake: false },
      {
        height: airframe.position.y,
        up: new Vec3(0, 1, 0),
        tangent: new Quaternion(),
        minimumAltitude: 0,
        planetary: false,
      },
      1 / 60,
    )
    world.step(1 / 60)
  }
  assert(hull.velocity.z < -5)
  assert(Math.abs(airframe.position.y - 30) < 0.1)
  assert.equal(world.vehicles.size, 0)
  console.log('Independent boat and hovering flight: OK; no wheel controllers')
} finally {
  world.removeBody(hull)
  world.removeBody(airframe)
  world.raw.free()
}
