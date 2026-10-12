import { expect, it } from 'vitest'
import { metalStrike } from '../../src/audio/metal-impact.js'
it('varies metal timbre within bounded pitch, level and decay ranges', () => {
  const low = metalStrike(() => 0),
    high = metalStrike(() => 1)
  expect(low.pitch).toBe(0.9)
  expect(high.pitch).toBeCloseTo(1.1)
  expect(low.strength).toBe(0.86)
  expect(high.strength).toBeCloseTo(1.1)
  expect(high.damping).toBeCloseTo(1.4)
  expect(low.modes).toHaveLength(4)
  expect(low).not.toEqual(high)
  for (const strike of [low, high])
    for (const mode of strike.modes) {
      expect(mode.detune).toBeGreaterThan(0)
      expect(mode.decay).toBeGreaterThan(0)
      expect(mode.delay + strike.attack).toBeLessThan(0.006)
    }
})
