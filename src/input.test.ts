import { expect, it } from 'vitest'
import { deadzone, gamepadAxes } from '../playground/input.js'
it('maps mode 2 sticks independently and ignores centre drift', () => {
  const pad = { axes: [0.56, -1, -0.56, -0.12], buttons: [] }
  const input = gamepadAxes(pad, true)
  expect(input.lift).toBe(1)
  expect(input.turn).toBeCloseTo(0.5)
  expect(input.right).toBeCloseTo(-0.5)
  expect(input.forward).toBeCloseTo(0)
  expect(deadzone(NaN)).toBe(0)
  const neutral = gamepadAxes({ axes: [], buttons: [] }, true)
  for (const axis of [neutral.forward, neutral.right, neutral.lift, neutral.turn])
    expect(axis).toBeCloseTo(0)
  expect(neutral.brake).toBe(false)
})
