import { describe, expect, it } from 'vitest'
import { performancePresets } from '../../src/config/performance.js'
import { presetResolutionScale } from '../../src/config/display.js'

/** Lighter profiles must never cost more than heavier ones, field by field. */
const ladder = ['minimal', 'low', 'balanced', 'high', 'ultra'] as const
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

/**
 * Mobile is the phone floor: no heavier than Minimal except buildings and pixel ratio, which
 * phones keep so the world stays readable; and never heavier than Low.
 */
describe('mobile profile', () => {
  const mobile = performancePresets.mobile
  const phoneExtras = new Set<string>(['buildings', 'resolution'])
  it('is no heavier than minimal outside buildings and pixel ratio', () => {
    for (const f of fields)
      if (!phoneExtras.has(f))
        expect(mobile.settings[f], f).toBeLessThanOrEqual(performancePresets.minimal.settings[f])
    expect(mobile.tiles).toBeLessThanOrEqual(performancePresets.minimal.tiles)
  })
  it('is never heavier than low', () => {
    const low = performancePresets.low
    for (const f of fields) expect(mobile.settings[f], f).toBeLessThanOrEqual(low.settings[f])
    expect(mobile.settings.resolution * presetResolutionScale('mobile')).toBeLessThanOrEqual(
      low.settings.resolution * presetResolutionScale('low'),
    )
  })
})
