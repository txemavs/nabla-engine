/** Pure public contracts: validation, coordinates, defaults, and authority. */
import assert from 'node:assert/strict'
import { parseScene } from '@nabla/engine/scene'
import { parseLatLon, tileOffsetFromGeo } from '@nabla/engine/planet/lat-lon'
import { LocalAuthority } from '@nabla/engine/net'
import { simulationDefaults } from '@nabla/engine/config/simulation'
import { createManualScene } from './scene.mjs'

const document = createManualScene()
assert.throws(() =>
  parseScene({ ...document, entities: [...document.entities, document.entities[0]] }),
)
assert.throws(() => parseScene({ ...document, version: 999 }))
const location = parseLatLon('43.3386, -1.7899')
assert(location)
assert.deepEqual(location, { latitude: 43.3386, longitude: -1.7899 })
assert.equal(parseLatLon('not a location'), undefined)
const offset = tileOffsetFromGeo(location)
assert.equal(offset.tile.z, 15)
assert(Number.isFinite(offset.dx) && Number.isFinite(offset.dz))
assert.equal(simulationDefaults.fixedStepSeconds, 1 / 60)
assert.equal(simulationDefaults.maxFrameSeconds, 0.1)
assert.equal(simulationDefaults.maxSubsteps, 8)

const authority = new LocalAuthority({
  items: [{ id: 'manual.item', item: 'manual.crate', count: 1, position: [0, 0, 0] }],
})
const removed = []
const unsubscribe = authority.onItems((change) => {
  if (change.type === 'removed') removed.push(change)
})
try {
  assert.equal(authority.request({ type: 'pickup', item: 'manual.item' }), true)
  assert.equal(authority.request({ type: 'pickup', item: 'manual.item' }), false)
  assert.equal(removed.length, 1)
  assert.equal(removed[0].by, 'local')
} finally {
  unsubscribe()
  authority.dispose()
}
console.log('Manual contracts: validation, geography, defaults, and single pickup passed.')
