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
test('reads single-track wheel.front and wheel.rear anchors as two hubs, front first', () => {
  const nodes = [
    { extras: { nabla: { anchor: 'wheel.rear' } }, translation: [0, 0.31, 0.72] },
    { extras: { nabla: { anchor: 'wheel.front' } }, translation: [0, 0.3, -0.72] },
  ]
  const rig = extractVehicleRig({ nodes, scenes: [{ nodes: [0, 1] }] }, identity)
  assert.deepEqual(rig.hubs, [
    [0, 0.3, -0.72],
    [0, 0.31, 0.72],
  ])
  assert.equal(rig.wheelRotations.length, 2)
})
test('rejects half a single-track rig and mixed wheel layouts', () => {
  const lonely = {
    nodes: [{ extras: { nabla: { anchor: 'wheel.front' } } }],
    scenes: [{ nodes: [0] }],
  }
  assert.throws(() => extractVehicleRig(lonely, identity), /Missing vehicle anchor: wheel.rear/)
  const mixed = fixture()
  mixed.nodes.push({ extras: { nabla: { anchor: 'wheel.front' } } })
  mixed.nodes[5].children.push(6)
  assert.throws(() => extractVehicleRig(mixed, identity), /mixes wheel.front/)
})
