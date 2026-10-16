import { expect, it } from 'vitest'
import { radioActionAt, targetScore } from '../../src/runtime/xr-panel-canvas.js'
it('scores the centre ten, the outer ring one, and misses zero', () => {
  expect(targetScore(512, 337)).toBe(10)
  expect(targetScore(512 + 22.4, 337)).toBe(10)
  expect(targetScore(512 + 22.6, 337)).toBe(9)
  expect(targetScore(512, 337 - 224)).toBe(1)
  expect(targetScore(512, 337 + 225)).toBe(1)
  expect(targetScore(512 + 226, 337)).toBe(0)
})

it('matches carousel photo, arrows, secondary controls and gaps to their actions', () => {
  expect(radioActionAt(512, 170)).toBe(1)
  expect(radioActionAt(100, 350)).toBe(0)
  expect(radioActionAt(900, 350)).toBe(2)
  expect(radioActionAt(100, 440)).toBe(3)
  expect(radioActionAt(500, 530)).toBe(7)
  for (const [x, y] of [
    [100, 170],
    [340, 350],
    [512, 400],
    [512, 580],
    [10, 300],
  ])
    expect(radioActionAt(x, y)).toBe(-1)
})
