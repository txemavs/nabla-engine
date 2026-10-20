import { describe, expect, it } from 'vitest'
import { performancePresets } from '../../src/config/performance.js'
import { presetResolutionScale } from '../../src/config/display.js'

/** Lighter profiles must never cost more than heavier ones, field by field. */
/** Mobile is the absolute floor (phones); Minimal keeps a little more reach for weak desktops. */
const ladder = ['mobile', 'minimal', 'low', 'balanced', 'high', 'ultra'] as const
const fields = [
  'vehicleShadows',
  'mirrors',
  'roads',
  'buildings',
  'distance',
  'fog',
  'relief',
  'collisions',
  'resolution',
  'shadows',
  'smoke',
] as const

describe('quality ladder', () => {
  for (let i = 1; i < ladder.length; i++) {
    const lighter = ladder[i - 1],
      heavier = ladder[i]
    it(`${lighter} is never heavier than ${heavier}`, () => {
      const a = performancePresets[lighter],
        b = performancePresets[heavier]
      for (const f of fields) expect(a.settings[f], f).toBeLessThanOrEqual(b.settings[f])
      expect(a.tiles).toBeLessThanOrEqual(b.tiles)
      expect(a.concurrent).toBeLessThanOrEqual(b.concurrent)
      // Final pixel ratio = preset resolution × fixed scale step.
      expect(a.settings.resolution * presetResolutionScale(lighter)).toBeLessThanOrEqual(
        b.settings.resolution * presetResolutionScale(heavier),
      )
    })
  }
})
