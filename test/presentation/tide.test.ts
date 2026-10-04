import { expect, it } from 'vitest'
import { simplifiedTide, TIDE_PERIOD_MS } from '../../src/planet/tide.js'
it('repeats high and low water with smooth rising and falling phases', () => {
  const t = Date.UTC(2026, 0, 1)
  expect(simplifiedTide(t)).toEqual({ level: 1, state: 'Pleamar' })
  expect(simplifiedTide(t + TIDE_PERIOD_MS / 2).level).toBeCloseTo(-1)
  expect(simplifiedTide(t + TIDE_PERIOD_MS / 4).state).toBe('Bajando')
  expect(simplifiedTide(t + (TIDE_PERIOD_MS * 3) / 4).state).toBe('Subiendo')
  expect(simplifiedTide(t + TIDE_PERIOD_MS).level).toBeCloseTo(1)
  expect(simplifiedTide(t - TIDE_PERIOD_MS / 2, 2).level).toBeCloseTo(-2)
  expect(simplifiedTide(t, 0)).toEqual({ level: 0, state: 'Sin oscilación' })
})
