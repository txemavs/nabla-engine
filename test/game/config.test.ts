import { describe, it, expect } from 'vitest'
import {
  parseGameConfig,
  configToUrl,
  requireGeographicTileBase,
  type GameConfig,
} from '../../game/config.js'

describe('game config', () => {
  describe('parseGameConfig', () => {
    it('preserves the planetary origin and sea-level altitude at zero', () => {
      expect(parseGameConfig('?lat=0&lon=0&alt=0').spawn).toEqual({
        latitude: 0,
        longitude: 0,
        altitude: 0,
        heading: 0,
      })
    })
    it('uses Zaisa defaults with no params', () => {
      const config = parseGameConfig('')

      expect(config.spawn.latitude).toBeCloseTo(43.3372, 4)
      expect(config.spawn.longitude).toBeCloseTo(-1.7523, 4)
      expect(config.spawn.altitude).toBe(50)
      expect(config.vehicle).toBe('car')
      expect(config.spawn.heading).toBe(0)
      expect(config.vehicles).toEqual([])
      expect(config.tilesBaseUrl).toBe(undefined)
      expect(config.staticTiles).toBe(true)
    })

    it('diagnoses missing terrain before geographic startup', () => {
      for (const search of ['', '?tiles=', '?tiles=%20']) {
        expect(() => requireGeographicTileBase(parseGameConfig(search))).toThrow(
          /Terrain source missing/,
        )
      }
      expect(requireGeographicTileBase(parseGameConfig('?tiles=/'))).toBe('')
      expect(requireGeographicTileBase(parseGameConfig('?static=false'))).toBe('/prepared')
      expect(requireGeographicTileBase(parseGameConfig('?tiles=/assets/local'))).toBe(
        '/assets/local',
      )
    })

    it('keeps the ?tiles= override and strips trailing slashes', () => {
      expect(parseGameConfig('?tiles=https://cdn.example.com/set/').tilesBaseUrl).toBe(
        'https://cdn.example.com/set',
      )
    })

    it('treats a blank ?tiles= as unconfigured and ?tiles=/ as this origin', () => {
      expect(parseGameConfig('?tiles=').tilesBaseUrl).toBe(undefined)
      expect(parseGameConfig('?tiles=%20').tilesBaseUrl).toBe(undefined)
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

    it('parses the player heading without changing the default start vehicle', () => {
      const config = parseGameConfig('?heading=118&vehicle=car')
      expect(config.spawn.heading).toBe(118)
      expect(config.vehicle).toBe('car')
    })

    it('parses extra host vehicles from ?vehicles= JSON', () => {
      const config = parseGameConfig(
        '?lat=43.3372&lon=-1.7523&vehicle=car&vehicles=' +
          encodeURIComponent(
            JSON.stringify([{ lat: 43.3386, lon: -1.7899, heading: 90, vehicle: 'white-truck' }]),
          ),
      )
      expect(config.vehicle).toBe('car')
      expect(config.vehicles).toEqual([
        { lat: 43.3386, lon: -1.7899, heading: 90, vehicle: 'white-truck' },
      ])
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

      expect(config.spawn.latitude).toBeCloseTo(43.3372, 4)
      expect(config.spawn.longitude).toBeCloseTo(-1.7523, 4)
      expect(config.spawn.altitude).toBe(50)
    })
  })

  describe('configToUrl', () => {
    it('generates URL with all params', () => {
      const config: GameConfig = {
        spawn: { latitude: 40.4168, longitude: -3.7038, altitude: 700, heading: 45 },
        vehicle: 'police',
        vehicles: [{ lat: 40.417, lon: -3.704, heading: 90, vehicle: 'white-truck' }],
        tilesBaseUrl: 'https://cdn.example.com/tiles',
        staticTiles: true,
      }

      const url = configToUrl(config)

      expect(url).toContain('lat=40.416800')
      expect(url).toContain('lon=-3.703800')
      expect(url).toContain('alt=700.0')
      expect(url).toContain('vehicle=police')
      expect(url).toContain('heading=45')
      expect(url).toContain('vehicles=')
      expect(url).toContain('tiles=https')
      expect(parseGameConfig(url).vehicles).toEqual(config.vehicles)
    })

    it('omits default values', () => {
      const config: GameConfig = {
        spawn: { latitude: 40.4168, longitude: -3.7038, altitude: 50, heading: 0 },
        vehicle: 'car',
        vehicles: [],
        tilesBaseUrl: undefined,
        staticTiles: true,
      }

      const url = configToUrl(config)

      expect(url).not.toContain('alt=')
      expect(url).not.toContain('vehicle=')
      expect(url).not.toContain('heading=')
      expect(url).not.toContain('vehicles=')
      expect(url).not.toContain('tiles=')
      expect(url).not.toContain('static=')
    })

    it('includes static=false when disabled', () => {
      const config: GameConfig = {
        spawn: { latitude: 40.4168, longitude: -3.7038, altitude: 50, heading: 0 },
        vehicle: 'car',
        vehicles: [],
        tilesBaseUrl: undefined,
        staticTiles: false,
      }

      const url = configToUrl(config)

      expect(url).toContain('static=false')
    })
  })
})
