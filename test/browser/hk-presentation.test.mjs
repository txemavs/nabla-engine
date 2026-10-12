import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barrelPose, applyReviewedPose, magazineRoundsForPreview } from './hk-presentation.mjs'

test('magazine marker follows remaining rounds, including removal and fresh insertion', () => {
  assert.equal(
    magazineRoundsForPreview({ reload: 'none', magazineSeated: true, magazine: 0 }, 13, 4),
    0,
  )
  assert.equal(
    magazineRoundsForPreview({ reload: 'magazine-out', magazineSeated: true, magazine: 3 }, 13, 3),
    3,
  )
  assert.equal(
    magazineRoundsForPreview({ reload: 'none', magazineSeated: false, magazine: 0 }, 13, 3),
    3,
  )
  assert.equal(
    magazineRoundsForPreview(
      {
        reload: 'magazine-in',
        magazineSeated: false,
        magazine: 0,
        pendingMagazine: { rounds: 13 },
      },
      13,
      0,
    ),
    13,
  )
})

test('the reviewed barrel returns exactly to rest and limits its artistic tilt', () => {
  assert.deepEqual(barrelPose(0), { angle: 0, position: [0, 0, 0] })
  assert.deepEqual(barrelPose(-1), barrelPose(0))
  assert.deepEqual(barrelPose(2), barrelPose(1))
  assert.equal(barrelPose(1).angle, 0.0175)
  for (let i = 0; i <= 100; i++) assert.ok(barrelPose(i / 100).position.every(Number.isFinite))
})
test('manual and animated poses do not accumulate offsets or move the frame guide', () => {
  const nodes = {
    Slide: { position: { z: 0.035 } },
    Barrel: {
      rotation: { x: 0 },
      position: {
        fromArray(v) {
          this.value = v
        },
      },
    },
    HammerPivot: { rotation: { x: 0 } },
    Hammer: { visible: false },
    FrontGuideExterior: { position: { z: 7 } },
  }
  const world = { getObjectByName: (n) => nodes[n] }
  applyReviewedPose(world, 0.035, 'single')
  const first = structuredClone(nodes.Barrel.position.value)
  for (let i = 0; i < 100; i++) applyReviewedPose(world, 0.035, 'single')
  assert.deepEqual(nodes.Barrel.position.value, first)
  assert.equal(nodes.FrontGuideExterior.position.z, 7)
  assert.equal(nodes.Hammer.visible, true)
  assert.equal(nodes.HammerPivot.rotation.x, 0.7)
  nodes.Slide.position.z = 0
  applyReviewedPose(world, 0.035, 'double')
  assert.deepEqual(nodes.Barrel.position.value, [0, 0, 0])
  assert.equal(nodes.HammerPivot.rotation.x, 0)
})
