/** Regression tests for authored hierarchy, rigid anchors and missing metadata. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractVehicleRig } from './vehicle-rig.mjs'

const identity = { position: [0, 0, 0], rotation: [0, 0, 0, 1] }
function fixture() {
  const nodes = ['wheel.fl', 'wheel.fr', 'wheel.rl', 'wheel.rr', 'steering'].map((role) => ({
    extras: { nabla: { anchor: role } },
    translation: [1, 0, 0],
  }))
  nodes.push({ translation: [0, 2, 0], rotation: [0, 1, 0, 0], children: [0, 1, 2, 3, 4] })
  return { nodes, scenes: [{ nodes: [5] }] }
}
test('composes parent rotation and chassis placement, preserving wheel order', () => {
  const doc = fixture()
  doc.nodes[1].translation = [2, 0, 0]
  const rig = extractVehicleRig(doc, { ...identity, position: [0, 3, 0] })
  assert.deepEqual(rig.hubs[0], [-1, 5, 0])
  assert.deepEqual(rig.hubs[1], [-2, 5, 0])
  assert.deepEqual(rig.steering.position, [-1, 5, 0])
})
test('rejects absent, duplicate and scaled anchors instead of guessing', () => {
  const missing = fixture()
  delete missing.nodes[0].extras
  assert.throws(() => extractVehicleRig(missing, identity), /Missing vehicle anchor/)
  const duplicate = fixture()
  duplicate.nodes[1].extras = duplicate.nodes[0].extras
  assert.throws(() => extractVehicleRig(duplicate, identity), /Duplicate vehicle anchor/)
  const scaled = fixture()
  scaled.nodes[5].scale = [2, 1, 1]
  assert.throws(() => extractVehicleRig(scaled, identity), /unit-scale/)
})
