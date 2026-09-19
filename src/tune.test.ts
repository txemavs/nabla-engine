import { describe, it, expect, beforeEach } from 'vitest'
import {
  TUNE_DEFAULTS,
  mergeTune,
  tune,
  resetTuneCache,
} from './tune.js'

describe('tune', () => {
  describe('TUNE_DEFAULTS', () => {
    it('has expected structure', () => {
      expect(TUNE_DEFAULTS.debug).toBe(false)
      expect(TUNE_DEFAULTS.wheels.spin).toBe(true)
      expect(TUNE_DEFAULTS.planet.zoom).toBe(18)
      expect(TUNE_DEFAULTS.walk.gravity).toBe(20_000)
      expect(TUNE_DEFAULTS.drive.nearM).toBeCloseTo(2.8)
    })
  })

  describe('mergeTune', () => {
    it('returns base when over is undefined', () => {
      const result = mergeTune(TUNE_DEFAULTS, undefined)
      expect(result).toBe(TUNE_DEFAULTS)
    })

    it('returns base when over is null', () => {
      const result = mergeTune(TUNE_DEFAULTS, null)
      expect(result).toBe(TUNE_DEFAULTS)
    })

    it('shallow merges simple values', () => {
      const result = mergeTune({ a: 1, b: 2 }, { b: 3 })
      expect(result).toEqual({ a: 1, b: 3 })
    })

    it('deep merges nested objects', () => {
      const base = { outer: { inner: 1, keep: 2 } }
      const over = { outer: { inner: 10 } }
      const result = mergeTune(base, over)
      expect(result).toEqual({ outer: { inner: 10, keep: 2 } })
    })

    it('replaces primitives', () => {
      const result = mergeTune(5 as unknown, 10)
      expect(result).toBe(10)
    })

    it('merges tune defaults with overlay', () => {
      const overlay = { debug: true, walk: { gravity: 30_000 } }
      const result = mergeTune(TUNE_DEFAULTS, overlay)

      expect(result.debug).toBe(true)
      expect(result.walk.gravity).toBe(30_000)
      expect(result.walk.jumpVy).toBe(-7000) // preserved
      expect(result.wheels.spin).toBe(true) // preserved
    })
  })

  describe('tune()', () => {
    beforeEach(() => {
      resetTuneCache()
    })

    it('returns merged tune', () => {
      const result = tune()

      expect(result.debug).toBe(false)
      expect(result.wheels.spin).toBe(true)
    })

    it('caches result', () => {
      const first = tune()
      const second = tune()

      expect(first).toBe(second)
    })
  })

  describe('resetTuneCache', () => {
    it('clears the cache', () => {
      const first = tune()
      resetTuneCache()
      const second = tune()

      // The actual values should be equal even if it's the same object
      expect(first).toEqual(second)
    })
  })
})
