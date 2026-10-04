import { expect, it } from 'vitest'
import {
  normalizePerformance,
  performancePresets,
  streamBudget,
} from '../../src/runtime/performance.js'
import { worldWater } from '../../src/runtime/water.js'
import { TIDE_PERIOD_MS } from '../../src/planet/tide.js'
it('sanitizes persisted or host-supplied quality without trusting prototype keys', () => {
  const p = normalizePerformance({
    preset: '__proto__',
    resolution: NaN,
    shadows: 99999,
    distance: -1,
    dof: 7,
  })
  expect(p.preset).toBe('custom')
  expect(p.resolution).toBe(1.25)
  expect(p.shadows).toBe(512)
  expect(p.distance).toBe(4000)
  expect(p.dof).toBe(0)
  expect(normalizePerformance(null).distance).toBe(4000)
})
it('shares named mobile budgets and preserves explicitly disabled render effects', () => {
  const p = normalizePerformance({ ...performancePresets.mobile.settings, preset: 'mobile' })
  expect(p.shadows).toBe(0)
  expect(p.mirrors).toBe(0)
  expect(p.buildings).toBe(0)
  expect(streamBudget(p)).toEqual({ concurrent: 1, ahead: 0, retain: false, tiles: 12 })
  expect(normalizePerformance({ preset: 'ultra' }).fog).toBe(8000)
})
it('manual sea level is independent of the world clock', () => {
  expect(worldWater({ mode: 'manual', level: 2, amplitude: 3 }, { mode: 'live' }, 0).level).toBe(2)
})
it('fixed clocks freeze tide while live clocks follow the same cycle in every host', () => {
  const epoch = Date.UTC(2026, 0, 1),
    water = { mode: 'tide' as const, level: 100, amplitude: 2 }
  const fixed = { mode: 'fixed' as const, at: new Date(epoch).toISOString() }
  expect(worldWater(water, fixed, epoch + TIDE_PERIOD_MS / 2).level).toBeCloseTo(2)
  expect(worldWater(water, { mode: 'live' }, epoch + TIDE_PERIOD_MS / 2).level).toBeCloseTo(-2)
})
