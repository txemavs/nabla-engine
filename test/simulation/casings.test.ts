/**
 * Ejected brass: it flies to the right, bounces off the ground, comes to rest and despawns.
 */
import { expect, it } from 'vitest'
import { weaponPreset } from '../../src/catalog/weapons/library.js'
import { CasingMotion } from '../../src/simulation/weapons/casings.js'

const spec = () => weaponPreset('hk-compact').casing!

it('lands to the right, bounces once and disappears after its lifetime', () => {
  const casing = spec()
  const motion = new CasingMotion(casing)
  motion.eject([0, 1.4, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0], () => 0.5)
  const ground = (from: readonly number[], direction: readonly number[], length: number) => {
    if (direction[1] >= 0) return null
    const distance = -from[1] / direction[1]
    return distance <= length
      ? {
          point: [from[0] + direction[0] * distance, 0, from[2] + direction[2] * distance] as [
            number,
            number,
            number,
          ],
          normal: [0, 1, 0] as [number, number, number],
        }
      : null
  }
  let bounced = false
  for (let t = 0; t < 3; t += 1 / 60) {
    motion.update(1 / 60, ground)
    if (motion.bounces.length) bounced = true
  }
  expect(bounced).toBe(true)
  const pose = motion.poses()[0]
  // To the shooter's right, and on the ground.
  expect(pose.position[0]).toBeGreaterThan(0.3)
  expect(pose.position[1]).toBeLessThan(0.02)
  // It comes to rest on the ground and stays there.
  for (let i = 0; i < 120; i++) motion.update(1 / 60, ground)
  const resting = motion.poses()[0].position.slice()
  expect(resting[1]).toBeLessThan(0.02)
  motion.update(1 / 60, ground)
  expect(motion.poses()[0].position[0]).toBeCloseTo(resting[0], 3)
  for (let i = 0; i < Math.ceil(casing.lifetimeS * 60); i++) motion.update(1 / 60, ground)
  expect(motion.count).toBe(0)
})

it('keeps only the newest casings', () => {
  const motion = new CasingMotion(spec())
  for (let i = 0; i < 40; i++) motion.eject([i, 1, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0], () => 0.5)
  expect(motion.count).toBeLessThanOrEqual(24)
  expect(motion.poses()[0].position[0]).toBeGreaterThan(10)
})

it('a dropped magazine falls, rests, and the pool keeps only the newest', () => {
  const motion = new CasingMotion(
    { ejectSpeedMs: 1.5, restitution: 0.2, friction: 0.65, lifetimeS: 30 },
    9.81,
    8,
    0.015,
  )
  const ground = (from: readonly number[], direction: readonly number[], length: number) => {
    if (direction[1] >= 0) return null
    const distance = -from[1] / direction[1]
    return distance <= length
      ? {
          point: [from[0] + direction[0] * distance, 0, from[2] + direction[2] * distance] as [
            number,
            number,
            number,
          ],
          normal: [0, 1, 0] as [number, number, number],
        }
      : null
  }
  motion.release([0.2, 1.2, 0], [0.1, -1.5, 0.2], [0, 0, 0], [0, 0, 0, 1])
  for (let i = 0; i < 180; i++) motion.update(1 / 60, ground)
  const resting = motion.poses()[0].position.slice()
  expect(resting[1]).toBeLessThan(0.03)
  motion.update(1 / 60, ground)
  expect(motion.poses()[0].position[0]).toBeCloseTo(resting[0], 3)
  expect(motion.poses()[0].orientation).toEqual([0, 0, 0, 1])
  for (let i = 0; i < 20; i++) motion.release([i, 1, 0], [0, -1, 0])
  expect(motion.count).toBe(8)
  expect(motion.poses()[0].position[0]).toBeGreaterThan(10)
})
