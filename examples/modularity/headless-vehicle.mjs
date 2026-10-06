/** Current PUBLIC APIs, no Studio, DOM, WebGL or audio context. Run after npm run build. */
import assert from 'node:assert/strict'
import { initPhysics, Simulation, createEntity, idleInput } from '@nabla/engine'
import { presetVehicle } from '@nabla/engine/vehicles'
await initPhysics()
const floor = createEntity('floor', 'box', [0, -0.5, 0])
floor.size = [1000, 1, 1000]
const sim = new Simulation({
  version: 1,
  name: 'Independent host',
  entities: [
    floor,
    presetVehicle('car', 'car', [0, 0.7, 0]),
    createEntity('spawn', 'spawn', [0, 1, 4]),
  ],
})
try {
  for (let i = 0; i < 180; i++) sim.step(1 / 60)
  sim.startInVehicle('car')
  // Entering selects P and runs the start-up (starter cranking, then the needle sweep while
  // the engine settles to idle): 1.6 s.
  for (let i = 0; i < 130; i++) sim.step(1 / 60)
  assert.equal(sim.vehicleInfo('car').ignition, 'running')
  assert(sim.vehicleInfo('car').parked)
  sim.setInput({ ...idleInput(), forward: 1 })
  for (let i = 0; i < 120; i++) sim.step(1 / 60)
  const info = sim.vehicleInfo('car')
  assert(info.speedKmh > 10)
  assert.equal(typeof globalThis.document, 'undefined')
  console.log(
    JSON.stringify({ example: 'headless vehicle', speedKmh: info.speedKmh, gear: info.gear }),
  )
} finally {
  sim.dispose()
}
