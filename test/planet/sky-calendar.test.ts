import { expect, it } from 'vitest'
import {
  liveSkyClock,
  localMinutes,
  shiftSkyClockKeepingRate,
  shiftSkyClockMinutes,
  skyRate,
  skyTime,
} from '../../src/planet/sky.js'

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

it('keeps a running speed when the clock is shifted, and fixes a real-time clock', () => {
  const now = Date.UTC(2026, 9, 16, 12, 0)
  const fast = liveSkyClock(20, now, Date.UTC(2026, 9, 16, 10, 0))
  const shifted = shiftSkyClockKeepingRate(fast, 60, now)
  expect(shifted.mode).toBe('live')
  expect(skyRate(shifted)).toBe(20)
  expect(skyTime(shifted, now).getTime()).toBe(Date.UTC(2026, 9, 16, 11, 0))
  const real = shiftSkyClockKeepingRate({ mode: 'live' }, 60, now)
  expect(real.mode).toBe('fixed')
  expect(skyTime(real, now).getTime()).toBe(now + 3600000)
})
