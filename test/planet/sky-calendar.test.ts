import { expect, it } from 'vitest'
import { localMinutes, shiftSkyClockMinutes, skyTime } from '../../src/planet/sky.js'

it('crosses midnight in both directions and returns to the original instant', () => {
  const start = { mode: 'fixed' as const, at: new Date(2026, 9, 16, 23, 59).toISOString() }
  const next = shiftSkyClockMinutes(start, 1)
  expect(skyTime(next).getDate()).toBe(17)
  expect(localMinutes(skyTime(next))).toBe(0)
  expect(shiftSkyClockMinutes(next, -1)).toEqual(start)
})
it('crosses month and year boundaries using the same simulation clock', () => {
  const start = { mode: 'fixed' as const, at: new Date(2026, 11, 31, 23, 0).toISOString() }
  const next = skyTime(shiftSkyClockMinutes(start, 120))
  expect([next.getFullYear(), next.getMonth(), next.getDate(), next.getHours()]).toEqual([
    2027, 0, 1, 1,
  ])
  expect(() => shiftSkyClockMinutes(start, NaN)).toThrow()
})
