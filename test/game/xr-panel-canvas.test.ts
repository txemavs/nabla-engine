import { expect, it } from 'vitest'
import { targetScore } from '../../src/runtime/xr-panel-canvas.js'
it('scores the centre ten, the outer ring one, and misses zero', () => {
  expect(targetScore(512, 337)).toBe(10)
  expect(targetScore(512 + 22.4, 337)).toBe(10)
  expect(targetScore(512 + 22.6, 337)).toBe(9)
  expect(targetScore(512, 337 - 224)).toBe(1)
  expect(targetScore(512, 337 + 225)).toBe(1)
  expect(targetScore(512 + 226, 337)).toBe(0)
})
