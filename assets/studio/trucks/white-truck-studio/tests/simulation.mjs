import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createRig, massProperties } from '../runtime/rig.mjs'

const dependency = process.env.RAPIER_MODULE
const { default: R } = await import(
  dependency ? pathToFileURL(dependency).href : '@dimforge/rapier3d-compat/rapier.es.js'
)
await R.init()
const manifest = JSON.parse(await readFile(new URL('../white-truck-studio.json', import.meta.url)))
const results = []

function environment(mode) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = 1 / 120
  world.numSolverIterations = 12
  world.createCollider(
    R.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0).setFriction(0.8),
  )
  const rig = createRig(R, world, manifest, { mode })
  return { world, rig }
}

function advance(env, seconds, input) {
  let maxError = 0
  for (let i = 0; i < Math.round(seconds * 120); i++) {
    env.rig.beforeStep(1 / 120, input)
    env.world.step()
    const t = env.rig.telemetry()
    if (t.coupled) maxError = Math.max(maxError, t.anchorError)
    for (const vehicle of t.vehicles) {
      assert(Object.values(vehicle.position).every(Number.isFinite))
      assert(vehicle.position.y > 0.6 && vehicle.position.y < 2)
      assert(Math.abs(vehicle.rotation.x) < 0.3 && Math.abs(vehicle.rotation.z) < 0.3)
    }
  }
  return maxError
}

for (const mode of ['tractor', 'trailer', 'coupled']) {
  const env = environment(mode)
  advance(env, 3, { parkingBrake: true })
  const resting = env.rig.telemetry()
  assert(resting.vehicles.every((v) => v.contacts.filter(Boolean).length >= 2))
  if (mode === 'trailer') {
    const start = env.rig.trailer.body.translation()
    advance(env, 5, {})
    const end = env.rig.trailer.body.translation()
    assert(Math.hypot(end.x - start.x, end.z - start.z) < 0.2)
    results.push({ mode, parked: true, telemetry: env.rig.telemetry() })
  } else {
    const start = env.rig.tractor.body.translation()
    const straightError = advance(env, 5, { throttle: 0.7 })
    const moving = env.rig.telemetry()
    assert(moving.speedMps > 2)
    assert(env.rig.tractor.body.translation().z < start.z - 5)
    if (mode === 'coupled') assert.equal(env.rig.detach().ok, false)
    const initialRotation = env.rig.tractor.body.rotation().y
    const turnError = advance(env, 3, { throttle: 0.15, steering: 0.35 })
    assert(Math.abs(env.rig.tractor.body.rotation().y - initialRotation) > 0.03)
    advance(env, 8, { brake: 1 })
    assert(env.rig.telemetry().speedMps < 0.3)
    if (mode === 'coupled') {
      assert(Math.max(straightError, turnError) < 0.08)
      assert.equal(env.rig.detach().ok, true)
      assert.equal(env.rig.telemetry().coupled, false)
      advance(env, 2, { parkingBrake: true })
    }
    results.push({
      mode,
      movedMeters: start.z - env.rig.tractor.body.translation().z,
      peakJointErrorMeters: Math.max(straightError, turnError),
      telemetry: env.rig.telemetry(),
    })
  }
  env.rig.dispose()
  env.rig.dispose()
  env.world.free()
}
const env = environment('coupled')
assert.equal(env.rig.detach().ok, true)
assert.equal(env.rig.attach().ok, true)
env.rig.detach()
env.rig.trailer.body.setTranslation({ x: 20, y: 1.2, z: 20 }, true)
assert.equal(env.rig.attach().ok, false)
assert.throws(() => env.rig.beforeStep(1, {}))
assert.throws(() => env.rig.beforeStep(1 / 120, { throttle: NaN }))
env.rig.dispose()
env.world.free()
const separated = environment('separated')
assert.equal(separated.rig.attach().ok, false)
separated.rig.tractor.body.setTranslation({ x: 0, y: 1.2, z: 0 }, true)
assert.equal(separated.rig.attach().ok, true)
advance(separated, 2, { parkingBrake: true })
separated.rig.dispose()
separated.world.free()
assert.throws(() => massProperties({ ...manifest.trailer, cargoMassKg: -1 }))
const loaded = environment('coupled')
assert.equal(loaded.rig.setCargoMass(12000).ok, true)
assert.equal(loaded.rig.telemetry().trailerMassKg, 18500)
assert(Math.abs(loaded.rig.trailer.body.mass() - 18500) < 1)
assert(loaded.rig.trailer.body.localCom().y > 0.6)
advance(loaded, 3, { parkingBrake: true })
advance(loaded, 5, { throttle: 0.7 })
assert(loaded.rig.telemetry().speedMps > 1)
assert.equal(loaded.rig.setCargoMass(0).ok, false)
advance(loaded, 3, { throttle: 0.1, steering: 0.2 })
advance(loaded, 12, { brake: 1 })
assert(loaded.rig.telemetry().speedMps < 0.3)
assert.equal(loaded.rig.setCargoMass(0).ok, true)
assert(Math.abs(loaded.rig.trailer.body.mass() - 6500) < 1)
results.push({
  mode: 'coupled-loaded',
  testedCargoKg: 12000,
  unloadedMassKg: 6500,
  status: 'mass, centre of mass, driving, turning, braking and unload passed',
})
loaded.rig.dispose()
loaded.world.free()
await writeFile(
  new URL('../simulation-results.json', import.meta.url),
  JSON.stringify({ status: 'passed', scope: 'synthetic flat ground only', results }, null, 2),
)
console.log(JSON.stringify(results, null, 2))
