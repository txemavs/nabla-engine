import { describe, it, expect } from 'vitest'
import {
  normalizeNames,
  hasCapability,
  kindPadWindow,
  isHullClass,
  kindMatchingMesh,
  CAPABILITY_DRIVE,
  CAPABILITY_FLY,
  CAPABILITY_SIT,
  type KindContract,
} from './kindCapability.js'

describe('kindCapability', () => {
  describe('normalizeNames', () => {
    it('normalizes array of strings', () => {
      expect(normalizeNames(['Drive', 'FLY', 'sit'])).toEqual(['drive', 'fly', 'sit'])
    })

    it('removes invalid names', () => {
      expect(normalizeNames(['drive', '123invalid', '', null, 'valid_name'])).toEqual(['drive', 'valid_name'])
    })

    it('removes duplicates', () => {
      expect(normalizeNames(['drive', 'DRIVE', 'Drive'])).toEqual(['drive'])
    })

    it('returns empty array for non-array', () => {
      expect(normalizeNames(null)).toEqual([])
      expect(normalizeNames(undefined)).toEqual([])
      expect(normalizeNames('string')).toEqual([])
    })
  })

  describe('hasCapability', () => {
    it('returns true when capability exists', () => {
      const contract: KindContract = { capabilities: ['drive', 'fly'] }
      expect(hasCapability(contract, 'drive')).toBe(true)
      expect(hasCapability(contract, 'fly')).toBe(true)
    })

    it('returns false when capability missing', () => {
      const contract: KindContract = { capabilities: ['drive'] }
      expect(hasCapability(contract, 'fly')).toBe(false)
    })

    it('handles null/undefined contract', () => {
      expect(hasCapability(null, 'drive')).toBe(false)
      expect(hasCapability(undefined, 'drive')).toBe(false)
    })

    it('handles missing capabilities array', () => {
      const contract: KindContract = {}
      expect(hasCapability(contract, 'drive')).toBe(false)
    })
  })

  describe('kindPadWindow', () => {
    it('returns drive for drive capability', () => {
      expect(kindPadWindow({ capabilities: [CAPABILITY_DRIVE] })).toBe('drive')
    })

    it('returns betaflight for fly capability', () => {
      expect(kindPadWindow({ capabilities: [CAPABILITY_FLY] })).toBe('betaflight')
    })

    it('returns betaflight for betaflight pad', () => {
      expect(kindPadWindow({ pads: ['betaflight'] })).toBe('betaflight')
    })

    it('returns drive for drive pad', () => {
      expect(kindPadWindow({ pads: ['drive'] })).toBe('drive')
    })

    it('pad overrides capability', () => {
      expect(kindPadWindow({ capabilities: [CAPABILITY_FLY], pads: ['drive'] })).toBe('drive')
    })

    it('returns null when no match', () => {
      expect(kindPadWindow({ capabilities: ['portal'] })).toBeNull()
      expect(kindPadWindow(null)).toBeNull()
    })
  })

  describe('isHullClass', () => {
    it('returns true for ship.home namespace', () => {
      expect(isHullClass({ kind_namespace: 'entity.system.ship.home' })).toBe(true)
    })

    it('returns true for container.5x10 namespace', () => {
      expect(isHullClass({ kind_namespace: 'entity.system.container.5x10' })).toBe(true)
    })

    it('returns true for sit + drive', () => {
      expect(isHullClass({ capabilities: [CAPABILITY_SIT, CAPABILITY_DRIVE] })).toBe(true)
    })

    it('returns false for drive only', () => {
      expect(isHullClass({ capabilities: [CAPABILITY_DRIVE] })).toBe(false)
    })

    it('returns false for sit only', () => {
      expect(isHullClass({ capabilities: [CAPABILITY_SIT] })).toBe(false)
    })
  })

  describe('kindMatchingMesh', () => {
    const kinds = [
      { mesh: { url: 'car.glb' }, namespace: 'entity.car.a3' },
      { mesh: { builtin: 'drone' }, namespace: 'entity.drone' },
    ]

    it('matches by URL', () => {
      const match = kindMatchingMesh({ url: 'car.glb' }, kinds)
      expect(match?.namespace).toBe('entity.car.a3')
    })

    it('matches by builtin', () => {
      const match = kindMatchingMesh({ builtin: 'drone' }, kinds)
      expect(match?.namespace).toBe('entity.drone')
    })

    it('returns undefined for no match', () => {
      const match = kindMatchingMesh({ url: 'unknown.glb' }, kinds)
      expect(match).toBeUndefined()
    })

    it('skips builtin:none', () => {
      const match = kindMatchingMesh({ builtin: 'none' }, kinds)
      expect(match).toBeUndefined()
    })

    it('skips builtin:example', () => {
      const match = kindMatchingMesh({ builtin: 'example' }, kinds)
      expect(match).toBeUndefined()
    })
  })
})
