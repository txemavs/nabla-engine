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
