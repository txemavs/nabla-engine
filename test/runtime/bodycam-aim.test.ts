import { expect, it } from 'vitest'
import { BodycamAim } from '../../src/runtime/bodycam-aim.js'
it('limits free aim and transfers excess motion to the camera without losing input', () => {
  const aim = new BodycamAim()
  const overflow = aim.move(0.3, -0.2)
  expect(aim.yaw + overflow.yaw).toBeCloseTo(0.3)
  expect(aim.pitch + overflow.pitch).toBeCloseTo(-0.2)
  const before = aim.yaw,
    follow = aim.step(0.016, false)
  expect(aim.yaw + follow.yaw).toBeCloseTo(before)
  expect(Math.abs(aim.yaw)).toBeLessThan(0.16)
})
it('centres faster while aiming and resets cleanly', () => {
  const normal = new BodycamAim(),
    aimed = new BodycamAim()
  normal.move(0.1, 0.1)
  aimed.move(0.1, 0.1)
  normal.step(0.05, false)
  aimed.step(0.05, true)
  expect(aimed.yaw).toBeLessThan(normal.yaw)
  aimed.reset()
  expect(aimed.yaw).toBe(0)
  expect(aimed.pitch).toBe(0)
})
