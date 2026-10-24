/** Installed-package regression: compatibility paths must share identities, not duplicate state. */
import assert from 'node:assert/strict'
import * as simulation from '@nabla/engine/simulation'
import * as root from '@nabla/engine'
import { PlaySession } from '@nabla/engine/runtime/session'
import { initPhysics } from '@nabla/engine/physics'
for (const key of ['Simulation', 'FIXED_STEP', 'idleInput'])
  assert.equal(simulation[key], root[key])
assert.equal(simulation.PlaySession, PlaySession)
assert.equal(simulation.initPhysics, initPhysics)
for (const kind of ['wheeled', 'two-wheeled', 'boat', 'flight']) {
  const old = await import('@nabla/engine/vehicles/' + kind)
  const current = await import('@nabla/engine/simulation/vehicles/' + kind)
  assert.deepEqual(Object.keys(current), Object.keys(old))
  for (const key of Object.keys(old)) assert.equal(current[key], old[key], kind + ':' + key)
}
assert.equal(typeof globalThis.document, 'undefined')
console.log('Simulation API and four vehicle compatibility aliases share export identities')
