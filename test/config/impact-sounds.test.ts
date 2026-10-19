import { describe, expect, it } from 'vitest'
import {
  impactSounds,
  isImpactSurface,
  sceneryImpactSurface,
  vehicleImpactSurface,
} from '../../src/config/impact-sounds.js'
import { sceneryPhysicsDefaults } from '../../src/config/scenery-physics.js'

describe('impact sounds by surface', () => {
  it('describe every surface with bounded, positive tone and a rate limit', () => {
    for (const sound of Object.values(impactSounds)) {
      expect(sound.pitch).toBeGreaterThan(0.25)
      expect(sound.pitch).toBeLessThan(4)
      expect(sound.level).toBeGreaterThan(0)
      expect(sound.level).toBeLessThanOrEqual(1)
      expect(sound.decay).toBeGreaterThan(0)
      expect(sound.minInterval).toBeGreaterThan(0)
    }
  })

  it('keeps the vehicle clang unchanged and gives signs their own thinner, shorter ping', () => {
    expect(impactSounds[vehicleImpactSurface]).toMatchObject({ pitch: 1, level: 1, decay: 1 })
    const sign = impactSounds[sceneryImpactSurface]
    expect(sign.pitch).toBeGreaterThan(1)
    expect(sign.decay).toBeLessThan(1)
    expect(sceneryPhysicsDefaults.surface).toBe(sceneryImpactSurface)
  })

  it('recognises only declared surfaces', () => {
    expect(isImpactSurface('metal-sign')).toBe(true)
    expect(isImpactSurface('metal-body')).toBe(true)
    expect(isImpactSurface('rubber')).toBe(false)
    expect(isImpactSurface(undefined)).toBe(false)
    expect(isImpactSurface('__proto__')).toBe(false)
  })
})
