import { describe, it, expect } from 'vitest'
import { parseGameConfig, configToUrl, type GameConfig } from '../../game/config.js'
import { DEFAULT_TILES_BASE_URL } from '../../src/render/planet/static-tiles.js'

describe('game config', () => {
  describe('parseGameConfig', () => {
    it('uses Zaisa defaults with no params', () => {
      const config = parseGameConfig('')

      expect(config.spawn.latitude).toBeCloseTo(43.3372, 4)
      expect(config.spawn.longitude).toBeCloseTo(-1.7523, 4)
      expect(config.spawn.altitude).toBe(50)
      expect(config.vehicle).toBe('car')
      expect(config.tilesBaseUrl).toBe('https://atlas.chained.world/euskadi')
      expect(config.staticTiles).toBe(true)
      expect(config.viewDistance).toBe(4000)
      expect(config.tileConcurrency).toBe(2)
      expect(config.prefetchAhead).toBe(30)
    })

    it('defaults to the Euskadi base, which never produces /z/z/ manifest URLs', () => {
      const config = parseGameConfig('')

      expect(config.tilesBaseUrl).toBe('https://atlas.chained.world/euskadi')
      expect(`${config.tilesBaseUrl}/z/15/16224/11998/manifest.json`).toBe(
        'https://atlas.chained.world/euskadi/z/15/16224/11998/manifest.json',
      )
      expect(config.tilesBaseUrl).not.toMatch(/\/z$/)
    })

    it('keeps the ?tiles= override and strips trailing slashes', () => {
      expect(parseGameConfig('?tiles=https://cdn.example.com/set/').tilesBaseUrl).toBe(
        'https://cdn.example.com/set',
      )
    })

    it('treats a blank ?tiles= as the default and ?tiles=/ as this origin', () => {
      expect(parseGameConfig('?tiles=').tilesBaseUrl).toBe(DEFAULT_TILES_BASE_URL)
      expect(parseGameConfig('?tiles=%20').tilesBaseUrl).toBe(DEFAULT_TILES_BASE_URL)
      expect(parseGameConfig('?tiles=/').tilesBaseUrl).toBe('')
    })

    it('round-trips an override and this-origin base through configToUrl', () => {
      for (const tiles of ['https://cdn.example.com/set', '/']) {
        const config = parseGameConfig(`?tiles=${tiles}`)
        expect(parseGameConfig(configToUrl(config)).tilesBaseUrl).toBe(config.tilesBaseUrl)
      }
    })

    it('parses custom spawn location', () => {
      const config = parseGameConfig('?lat=40.4168&lon=-3.7038&alt=700')

      expect(config.spawn.latitude).toBeCloseTo(40.4168, 4)
      expect(config.spawn.longitude).toBeCloseTo(-3.7038, 4)
      expect(config.spawn.altitude).toBe(700)
    })

    it('parses vehicle selection', () => {
      const config = parseGameConfig('?vehicle=police')

      expect(config.vehicle).toBe('police')
    })

    it('parses tiles base URL', () => {
      const config = parseGameConfig('?tiles=https://cdn.example.com/tiles')

      expect(config.tilesBaseUrl).toBe('https://cdn.example.com/tiles')
    })

    it('enables static mode by default with no tiles param', () => {
      const config = parseGameConfig('')

      expect(config.staticTiles).toBe(true)
    })

    it('enables static mode with tiles param', () => {
      const config = parseGameConfig('?tiles=/custom/tiles')

      expect(config.staticTiles).toBe(true)
    })

    it('disables static mode when explicitly set to false', () => {
      const config = parseGameConfig('?static=false')

      expect(config.staticTiles).toBe(false)
    })

    it('enables static mode with static=true', () => {
      const config = parseGameConfig('?static=true')

      expect(config.staticTiles).toBe(true)
    })

    it('enables static mode with static=1', () => {
      const config = parseGameConfig('?static=1')

      expect(config.staticTiles).toBe(true)
    })

    it('parses view distance', () => {
      const config = parseGameConfig('?distance=10000')

      expect(config.viewDistance).toBe(10000)
    })

    it('clamps view distance to valid range', () => {
      expect(parseGameConfig('?distance=500').viewDistance).toBe(1000)
      expect(parseGameConfig('?distance=30000').viewDistance).toBe(20000)
      expect(parseGameConfig('?distance=invalid').viewDistance).toBe(4000)
    })

    it('parses tile concurrency', () => {
      const config = parseGameConfig('?concurrency=3')

      expect(config.tileConcurrency).toBe(3)
    })

    it('clamps tile concurrency to valid range', () => {
      expect(parseGameConfig('?concurrency=0').tileConcurrency).toBe(1)
      expect(parseGameConfig('?concurrency=1').tileConcurrency).toBe(1)
      expect(parseGameConfig('?concurrency=3').tileConcurrency).toBe(3)
      expect(parseGameConfig('?concurrency=5').tileConcurrency).toBe(3)
    })

    it('parses prefetch ahead', () => {
      const config = parseGameConfig('?ahead=45')

      expect(config.prefetchAhead).toBe(45)
    })

    it('clamps prefetch ahead to valid range', () => {
      expect(parseGameConfig('?ahead=0').prefetchAhead).toBe(0)
      expect(parseGameConfig('?ahead=-5').prefetchAhead).toBe(0)
      expect(parseGameConfig('?ahead=60').prefetchAhead).toBe(45)
      expect(parseGameConfig('?ahead=invalid').prefetchAhead).toBe(30)
    })

    it('clamps latitude to valid range', () => {
      const tooHigh = parseGameConfig('?lat=100')
      expect(tooHigh.spawn.latitude).toBe(85)

      const tooLow = parseGameConfig('?lat=-100')
      expect(tooLow.spawn.latitude).toBe(-85)
    })

    it('normalizes longitude to -180..180 range', () => {
      const wrapped = parseGameConfig('?lon=200')
      expect(wrapped.spawn.longitude).toBeCloseTo(-160, 4)

      const negativeWrapped = parseGameConfig('?lon=-200')
      expect(negativeWrapped.spawn.longitude).toBeCloseTo(160, 4)
    })

    it('handles invalid numbers gracefully', () => {
      const config = parseGameConfig('?lat=invalid&lon=NaN&alt=abc')

      expect(config.spawn.latitude).toBeCloseTo(43.3372, 4)
      expect(config.spawn.longitude).toBeCloseTo(-1.7523, 4)
      expect(config.spawn.altitude).toBe(50)
    })
  })

  describe('configToUrl', () => {
    it('generates URL with all params', () => {
      const config: GameConfig = {
        spawn: { latitude: 40.4168, longitude: -3.7038, altitude: 700 },
        vehicle: 'police',
        tilesBaseUrl: 'https://cdn.example.com/tiles',
        staticTiles: true,
        viewDistance: 10000,
        tileConcurrency: 3,
        prefetchAhead: 45,
      }

      const url = configToUrl(config)

      expect(url).toContain('lat=40.416800')
      expect(url).toContain('lon=-3.703800')
      expect(url).toContain('alt=700.0')
      expect(url).toContain('vehicle=police')
      expect(url).toContain('tiles=https')
      expect(url).toContain('distance=10000')
      expect(url).toContain('concurrency=3')
      expect(url).toContain('ahead=45')
    })

    it('omits default values', () => {
      const config: GameConfig = {
        spawn: { latitude: 40.4168, longitude: -3.7038, altitude: 50 },
        vehicle: 'car',
        tilesBaseUrl: DEFAULT_TILES_BASE_URL,
        staticTiles: true,
        viewDistance: 4000,
        tileConcurrency: 2,
        prefetchAhead: 30,
      }

      const url = configToUrl(config)

      expect(url).not.toContain('alt=')
      expect(url).not.toContain('vehicle=')
      expect(url).not.toContain('tiles=')
      expect(url).not.toContain('static=')
      expect(url).not.toContain('distance=')
      expect(url).not.toContain('concurrency=')
      expect(url).not.toContain('ahead=')
    })

    it('includes static=false when disabled', () => {
      const config: GameConfig = {
        spawn: { latitude: 40.4168, longitude: -3.7038, altitude: 50 },
        vehicle: 'car',
        tilesBaseUrl: DEFAULT_TILES_BASE_URL,
        staticTiles: false,
        viewDistance: 4000,
        tileConcurrency: 2,
        prefetchAhead: 30,
      }

      const url = configToUrl(config)

      expect(url).toContain('static=false')
    })

    it('includes non-default streaming options', () => {
      const config: GameConfig = {
        spawn: { latitude: 40.4168, longitude: -3.7038, altitude: 50 },
        vehicle: 'car',
        tilesBaseUrl: DEFAULT_TILES_BASE_URL,
        staticTiles: true,
        viewDistance: 10000,
        tileConcurrency: 3,
        prefetchAhead: 45,
      }

      const url = configToUrl(config)

      expect(url).toContain('distance=10000')
      expect(url).toContain('concurrency=3')
      expect(url).toContain('ahead=45')
    })
  })
})
