import { describe, it, expect } from 'vitest'
import { parseGameConfig, configToUrl, type GameConfig } from '../../game/config.js'
import { DEFAULT_TILES_BASE_URL } from '../../src/render/planet/static-tiles.js'

describe('game config', () => {
  describe('parseGameConfig', () => {
    it('uses Zaisa defaults with no params', () => {
      const config = parseGameConfig('')

      // Updated spawn coordinates on land (west of Bidasoa river)
      expect(config.spawn.latitude).toBeCloseTo(43.3365, 4)
      expect(config.spawn.longitude).toBeCloseTo(-1.7565, 4)
      expect(config.spawn.altitude).toBe(50)
      expect(config.vehicle).toBe('car')
      expect(config.tilesBaseUrl).toBe('https://atlas.chained.world/euskadi')
      expect(config.staticTiles).toBe(true)
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

      // Falls back to Zaisa defaults on land
      expect(config.spawn.latitude).toBeCloseTo(43.3365, 4)
      expect(config.spawn.longitude).toBeCloseTo(-1.7565, 4)
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
      }

      const url = configToUrl(config)

      expect(url).toContain('lat=40.416800')
      expect(url).toContain('lon=-3.703800')
      expect(url).toContain('alt=700.0')
      expect(url).toContain('vehicle=police')
      expect(url).toContain('tiles=https')
    })

    it('omits default values', () => {
      const config: GameConfig = {
        spawn: { latitude: 40.4168, longitude: -3.7038, altitude: 50 },
        vehicle: 'car',
        tilesBaseUrl: DEFAULT_TILES_BASE_URL,
        staticTiles: true,
      }

      const url = configToUrl(config)

      expect(url).not.toContain('alt=')
      expect(url).not.toContain('vehicle=')
      expect(url).not.toContain('tiles=')
      expect(url).not.toContain('static=')
    })

    it('includes static=false when disabled', () => {
      const config: GameConfig = {
        spawn: { latitude: 40.4168, longitude: -3.7038, altitude: 50 },
        vehicle: 'car',
        tilesBaseUrl: DEFAULT_TILES_BASE_URL,
        staticTiles: false,
      }

      const url = configToUrl(config)

      expect(url).toContain('static=false')
    })
  })
})
