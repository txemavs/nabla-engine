import { describe, expect, it } from 'vitest'
import {
  formatClockTime,
  localMinutes,
  parseClockTime,
  skyClockAtMinutes,
} from '../../src/planet/sky.js'

describe('time of day helpers', () => {
  it('parses clock times and rejects the rest', () => {
    expect(parseClockTime('21:30')).toBe(1290)
    expect(parseClockTime('9')).toBe(540)
    expect(parseClockTime('07.05')).toBe(425)
    expect(parseClockTime(' 00:00 ')).toBe(0)
    expect(parseClockTime('23:59')).toBe(1439)
    for (const bad of ['', '24:00', '12:60', '12:5', 'noon', '-1', '1:2:3'])
      expect(parseClockTime(bad), bad).toBeUndefined()
  })

  it('formats and wraps minutes', () => {
    expect(formatClockTime(0)).toBe('00:00')
    expect(formatClockTime(1290)).toBe('21:30')
    expect(formatClockTime(1440 + 5)).toBe('00:05')
    expect(formatClockTime(-1)).toBe('23:59')
  })

  it('keeps the day of a fixed clock and sets the local time of day', () => {
    const base = new Date(2026, 5, 21, 12, 30)
    const clock = skyClockAtMinutes({ mode: 'fixed', at: base.toISOString() }, 21 * 60 + 30)
    expect(clock.mode).toBe('fixed')
    const at = new Date((clock as { at: string }).at)
    expect(localMinutes(at)).toBe(1290)
    expect([at.getFullYear(), at.getMonth(), at.getDate()]).toEqual([2026, 5, 21])
    // Moving the hour again keeps the same day.
    const early = new Date((skyClockAtMinutes(clock, 90) as { at: string }).at)
    expect([localMinutes(early), early.getDate()]).toEqual([90, 21])
  })

  it('turns a live clock into a fixed one for today and clamps the range', () => {
    const now = new Date(2026, 9, 5, 15, 0).getTime()
    const clock = skyClockAtMinutes({ mode: 'live' }, 99999, now) as { at: string }
    const at = new Date(clock.at)
    expect(localMinutes(at)).toBe(1439)
    expect(at.getDate()).toBe(5)
    expect(
      localMinutes(new Date((skyClockAtMinutes(undefined, -4, now) as { at: string }).at)),
    ).toBe(0)
  })
})
