import { test, expect } from 'vitest'
import { geographicPose, anchoredWorldPose } from './geographic-pose.js'
import { MADRID } from '../../src/geography.js'
import { rotationDegrees } from '../../src/scene.js'

test('implicit GPS anchors have zero offsets and preserve a rotated world pose', () => {
  const world = {
    position: [124, 653, -291] as [number, number, number],
    rotation: rotationDegrees(4, 33, -2),
  }
  const display = geographicPose(MADRID, world)
  expect(display.pose.position).toEqual([0, 0, 0])
  const restored = anchoredWorldPose(MADRID, display.anchor, display.pose)
  restored.position.forEach((n, i) => expect(n).toBeCloseTo(world.position[i], 6))
  restored.rotation.forEach((n, i) => expect(n).toBeCloseTo(world.rotation[i], 10))
  const moved = anchoredWorldPose(MADRID, display.anchor, { ...display.pose, position: [2, 3, 4] })
  const pinned = geographicPose(MADRID, moved, display.anchor)
  pinned.pose.position.forEach((n, i) => expect(n).toBeCloseTo([2, 3, 4][i], 6))
  expect(() =>
    anchoredWorldPose(MADRID, { ...display.anchor, latitude: 100 }, display.pose),
  ).toThrow()
})
