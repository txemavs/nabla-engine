import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  readGameOptions,
  saveGameOptions,
  formatBytes,
  type GameOptions,
} from '../../game/options.js'

const STORAGE_KEY = 'nabla.game.options.v1'

describe('game options', () => {
  let originalStorage: Storage

  beforeEach(() => {
    originalStorage = globalThis.localStorage
    const store: Record<string, string> = {}
    globalThis.localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key]
      },
      key: () => null,
      length: 0,
    }
  })

  afterEach(() => {
    globalThis.localStorage = originalStorage
  })

  describe('readGameOptions', () => {
    it('returns defaults when no stored options', () => {
      const options = readGameOptions()

      expect(options.cacheBudgetMb).toBe(100000)
      expect(options.tileConcurrency).toBe(2)
      expect(options.prefetchAhead).toBe(30)
      expect(options.viewDistance).toBe(4000)
      expect(options.tilesBaseUrl).toBe('')
      expect(options.vehicle).toBe('')
    })

    it('loads stored options', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          cacheBudgetMb: 50000,
          tileConcurrency: 3,
          prefetchAhead: 45,
          viewDistance: 10000,
          tilesBaseUrl: 'https://custom.example.com',
          vehicle: 'police',
        }),
      )

      const options = readGameOptions()

      expect(options.cacheBudgetMb).toBe(50000)
      expect(options.tileConcurrency).toBe(3)
      expect(options.prefetchAhead).toBe(45)
      expect(options.viewDistance).toBe(10000)
      expect(options.tilesBaseUrl).toBe('https://custom.example.com')
      expect(options.vehicle).toBe('police')
    })

    it('clamps out-of-range values', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          cacheBudgetMb: 200000,
          tileConcurrency: 10,
          prefetchAhead: 100,
          viewDistance: 50000,
        }),
      )

      const options = readGameOptions()

      expect(options.cacheBudgetMb).toBe(100000)
      expect(options.tileConcurrency).toBe(3) // clamped to max
      expect(options.prefetchAhead).toBe(45) // clamped to max
      expect(options.viewDistance).toBe(4000) // falls back to default (not in allowed list)
    })

    it('handles invalid JSON gracefully', () => {
      localStorage.setItem(STORAGE_KEY, 'not valid json')

      const options = readGameOptions()

      expect(options.cacheBudgetMb).toBe(100000)
    })

    it('handles invalid types gracefully', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          cacheBudgetMb: 'not a number',
          tileConcurrency: null,
          prefetchAhead: undefined,
        }),
      )

      const options = readGameOptions()

      expect(options.cacheBudgetMb).toBe(100000)
      expect(options.tileConcurrency).toBe(2)
      expect(options.prefetchAhead).toBe(30)
    })
  })

  describe('saveGameOptions', () => {
    it('saves options to localStorage', () => {
      const options: GameOptions = {
        cacheBudgetMb: 25000,
        tileConcurrency: 1,
        prefetchAhead: 15,
        viewDistance: 2000,
        tilesBaseUrl: '/custom',
        vehicle: 'carrier',
      }

      saveGameOptions(options)

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.cacheBudgetMb).toBe(25000)
      expect(stored.tileConcurrency).toBe(1)
      expect(stored.prefetchAhead).toBe(15)
      expect(stored.viewDistance).toBe(2000)
      expect(stored.tilesBaseUrl).toBe('/custom')
      expect(stored.vehicle).toBe('carrier')
    })

    it('round-trips through read', () => {
      const options: GameOptions = {
        cacheBudgetMb: 5000,
        tileConcurrency: 3,
        prefetchAhead: 0,
        viewDistance: 20000,
        tilesBaseUrl: '',
        vehicle: '',
      }

      saveGameOptions(options)
      const loaded = readGameOptions()

      expect(loaded).toEqual(options)
    })
  })

  describe('formatBytes', () => {
    it('formats bytes', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(500)).toBe('500 B')
      expect(formatBytes(999)).toBe('999 B')
    })

    it('formats kilobytes', () => {
      expect(formatBytes(1000)).toBe('1.0 KB')
      expect(formatBytes(1500)).toBe('1.5 KB')
      expect(formatBytes(999999)).toBe('1000.0 KB')
    })

    it('formats megabytes', () => {
      expect(formatBytes(1_000_000)).toBe('1.0 MB')
      expect(formatBytes(100_000_000)).toBe('100.0 MB')
      expect(formatBytes(999_999_999)).toBe('1000.0 MB')
    })

    it('formats gigabytes', () => {
      expect(formatBytes(1_000_000_000)).toBe('1.00 GB')
      expect(formatBytes(100_000_000_000)).toBe('100.00 GB')
      expect(formatBytes(107_374_182_400)).toBe('107.37 GB')
    })
  })
})
