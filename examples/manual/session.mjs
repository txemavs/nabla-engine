/** Run after npm run build: node examples/manual/session.mjs */
import assert from 'node:assert/strict'
import { idleInput } from '@nabla/engine'
import { PlaySession } from '@nabla/engine/runtime/session'
import { createManualScene } from './scene.mjs'

const document = createManualScene()
const authored = JSON.stringify(document)
const session = new PlaySession()
try {
  const simulation = await session.play(document, { physicsWorker: false })
  assert.equal(session.state, 'playing')
  for (let i = 0; i < 180; i++) await session.step(1 / 60)
  simulation.startInVehicle('manual-car')
  for (let i = 0; i < 130; i++) await session.step(1 / 60)
  assert.equal(simulation.vehicleInfo('manual-car').ignition, 'running')

  const input = { ...idleInput(), forward: 1 }
  for (let i = 0; i < 180; i++) await session.step(1 / 60, input)
  const speedKmh = simulation.vehicleInfo('manual-car').speedKmh
  assert(speedKmh > 10, `Expected acceleration, got ${speedKmh} km/h`)

  session.pause()
  assert.equal(session.state, 'paused')
  const pausedPose = structuredClone(simulation.entityTransform('manual-car'))
  await session.step(1, input)
  assert.deepEqual(simulation.entityTransform('manual-car'), pausedPose)
  session.resume()
  assert.equal(session.state, 'playing')
  assert.equal(JSON.stringify(document), authored, 'Simulation changed authored data')
  console.log(JSON.stringify({ example: 'manual session', speedKmh, authoredUnchanged: true }))
} finally {
  session.dispose()
}
assert.equal(session.state, 'disposed')
assert.equal(session.simulation, null)
assert.throws(() => session.resume(), /disposed/i)
