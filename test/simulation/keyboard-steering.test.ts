import { expect, it } from 'vitest'
import { KeyboardSteering } from '../../src/simulation/vehicles/keyboard-steering.js'
it('softens taps, releases quickly, and resets between drivers', () => {
  const steering = new KeyboardSteering()
  const tap = steering.update('car', 1, 0.05)
  expect(tap).toBeGreaterThan(0.05)
  expect(tap).toBeLessThan(0.15)
  let held = tap
  for (let i = 0; i < 20; i++) held = steering.update('car', 1, 0.05)
  expect(held).toBeGreaterThan(0.9)
  for (let i = 0; i < 5; i++) held = steering.update('car', 0, 0.05)
  expect(held).toBeLessThan(0.13)
  expect(steering.update('other', 0, 0.05)).toBe(0)
  expect(steering.update(null, 1, 0.05)).toBe(1)
})
it('recovers from non-finite demand or frame time instead of freezing at NaN', () => {
  const steering = new KeyboardSteering()
  steering.update('car', 1, 0.05)
  expect(Number.isFinite(steering.update('car', Number.NaN, 0.05))).toBe(true)
  expect(Number.isFinite(steering.update('car', 1, Number.NaN))).toBe(true)
  expect(Number.isFinite(steering.update('car', 1, Number.POSITIVE_INFINITY))).toBe(true)
  let value = 0
  for (let i = 0; i < 20; i++) value = steering.update('car', 1, 0.05)
  expect(value).toBeGreaterThan(0.9)
  for (let i = 0; i < 20; i++) value = steering.update('car', 0, 0.05)
  expect(value).toBe(0)
})
