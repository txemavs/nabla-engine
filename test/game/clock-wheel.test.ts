import { expect, it } from 'vitest'
import { createWheelStepper, wheelIdleMs, wheelStepPixels } from '../../game/clock-wheel.js'

it('turns each mouse notch into one step, up being forward in time', () => {
  const wheel = createWheelStepper()
  expect(wheel.push(-100, 0, 0)).toBe(1)
  expect(wheel.push(100, 0, 1000)).toBe(-1)
  expect(wheel.push(-120, 0, 2000)).toBe(1)
})

it('adds up small trackpad deltas and forgets a gesture left half done', () => {
  const wheel = createWheelStepper()
  for (let i = 0; i < 9; i++) expect(wheel.push(-10, 0, i * 10)).toBe(0)
  expect(wheel.push(-10, 0, 100)).toBe(1)
  expect(wheel.push(-60, 0, 150)).toBe(0)
  // Paused too long: the 60 px are forgotten, not added to the next gesture.
  expect(wheel.push(-60, 0, 150 + wheelIdleMs + 1)).toBe(0)
  expect(wheel.push(-40, 0, 150 + wheelIdleMs + 50)).toBe(1)
})

it('converts line and page wheels and ignores empty or invalid events', () => {
  const wheel = createWheelStepper()
  expect(wheel.push(-3, 1, 0)).toBe(1)
  expect(wheel.push(-1, 2, 1000)).toBe(1)
  expect(wheel.push(0, 0, 2000)).toBe(0)
  expect(wheel.push(Number.NaN, 0, 3000)).toBe(0)
  expect(wheel.push(-wheelStepPixels * 3, 0, 4000)).toBe(3)
})
