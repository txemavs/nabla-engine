import { describe, expect, it } from 'vitest'
import {
  normalizePerformance,
  performanceDefaults,
  performancePresets,
  visibilityChoices,
} from '../../src/config/performance.js'
import {
  normalizeVisibility,
  parseStoredVisibility,
  serializeVisibility,
} from '../../src/runtime/visibility-settings.js'

describe('visibility choices', () => {
  it('keep the supported values of the quality profiles', () => {
    expect(visibilityChoices.fog).toEqual([500, 1000, 2000, 4000, 8000, 16000])
    expect(visibilityChoices.roads).toEqual([0, 250, 500, 1000, 2000, 4000, 6000, 20000])
    expect(visibilityChoices.collisions).toEqual([200, 400, 800, 2000])
    expect(visibilityChoices.relief).toEqual([2, 4, 8, 12])
    expect(visibilityChoices.buildings).toEqual([0, 1])
  })

  it('accept every value the named profiles use, so the menu can always show the current one', () => {
    for (const [name, preset] of Object.entries(performancePresets)) {
      const settings = normalizePerformance({ ...preset.settings, preset: name })
      for (const key of Object.keys(visibilityChoices) as (keyof typeof visibilityChoices)[])
        expect(visibilityChoices[key], `${name}.${key}`).toContain(settings[key])
    }
    for (const key of Object.keys(visibilityChoices) as (keyof typeof visibilityChoices)[])
      expect(visibilityChoices[key]).toContain(performanceDefaults[key])
  })

  it('normalizing a profile is unchanged by the shared lists', () => {
    expect(
      normalizePerformance({ fog: 8000, roads: 0, collisions: 800, relief: 12 }),
    ).toMatchObject({
      fog: 8000,
      roads: 0,
      collisions: 800,
      relief: 12,
    })
    expect(normalizePerformance({ fog: 123, roads: 7, relief: 3 })).toMatchObject({
      fog: performanceDefaults.fog,
      roads: performanceDefaults.roads,
      relief: performanceDefaults.relief,
    })
  })
})

describe('remembered visibility', () => {
  it('keeps only supported values', () => {
    expect(normalizeVisibility({ fog: 4000, roads: 3, buildings: 0, extra: 1 })).toEqual({
      fog: 4000,
      buildings: 0,
    })
    expect(normalizeVisibility(null)).toEqual({})
    expect(normalizeVisibility(JSON.parse('{"__proto__":{"fog":500}}'))).toEqual({})
  })

  it('belongs to the quality profile it was chosen in', () => {
    const raw = serializeVisibility('high', { fog: 8000, collisions: 800 })
    expect(parseStoredVisibility(raw, 'high')).toEqual({ fog: 8000, collisions: 800 })
    expect(parseStoredVisibility(raw, 'low')).toEqual({})
  })

  it('treats missing, foreign or corrupt storage as nothing remembered', () => {
    expect(parseStoredVisibility(null, 'custom')).toEqual({})
    expect(parseStoredVisibility('{not json', 'custom')).toEqual({})
    expect(
      parseStoredVisibility('{"schema":"other","preset":"custom","values":{"fog":500}}', 'custom'),
    ).toEqual({})
  })
})
