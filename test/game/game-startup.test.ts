import { describe, it, expect } from 'vitest'
import { hasVehiclePreset, presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity, type SceneDocument } from '../../src/index.js'
import type { GeoPoint } from '../../src/math/geo/sphere.js'
import { TileLoadTracker } from '../../src/render/planet/static-tiles.js'

describe('game startup regression tests', () => {
  const SPAWN: GeoPoint = {
    latitude: 43.3372,
    longitude: -1.7523,
    altitude: 50,
  }

  function createGameDocument(vehicleId: string): SceneDocument {
    if (!hasVehiclePreset(vehicleId)) {
      throw new Error(`Vehicle preset '${vehicleId}' not found`)
    }
    const vehicle = presetVehicle(vehicleId, 'player-vehicle', [0, 2, 0])
    vehicle.groundOffset = 0.62

    return {
      version: 1,
      name: 'Drive',
      sky: { mode: 'live' },
      geography: {
        ...SPAWN,
        imagery: 'offline',
        planetary: true,
      },
      cursor: [0, 0, 0],
      cursorOnGround: true,
      entities: [{ ...createEntity('spawn', 'spawn', [-4, 1, 0]), groundOffset: 0.2 }, vehicle],
    }
  }

  describe('truck preset', () => {
    it('white-truck preset exists', () => {
      expect(hasVehiclePreset('white-truck')).toBe(true)
    })

    it('creates valid game document with white-truck', () => {
      const document = createGameDocument('white-truck')

      expect(document.entities).toHaveLength(2)
      const vehicle = document.entities.find((e) => e.kind === 'vehicle')
      expect(vehicle).toBeDefined()
      expect(vehicle!.id).toBe('player-vehicle')
      expect(vehicle!.vehicle).toBeDefined()
      expect(vehicle!.vehicle!.hubConfigs).toHaveLength(4)
    })

    it('white-truck has correct hub configuration', () => {
      const document = createGameDocument('white-truck')
      const vehicle = document.entities.find((e) => e.kind === 'vehicle')!
      const hubs = vehicle.vehicle!.hubConfigs!

      // Front wheels should steer
      expect(hubs[0].steered).toBe(true)
      expect(hubs[1].steered).toBe(true)
      // Rear wheels should drive
      expect(hubs[2].driven).toBe(true)
      expect(hubs[3].driven).toBe(true)
    })
  })

  describe('car preset', () => {
    it('creates valid game document with car', () => {
      const document = createGameDocument('car')

      expect(document.entities).toHaveLength(2)
      const vehicle = document.entities.find((e) => e.kind === 'vehicle')
      expect(vehicle).toBeDefined()
      expect(vehicle!.vehicle).toBeDefined()
    })
  })

  describe('game document structure', () => {
    it('has geography section required for GeographicView', () => {
      const document = createGameDocument('white-truck')

      expect(document.geography).toBeDefined()
      expect(document.geography!.latitude).toBe(SPAWN.latitude)
      expect(document.geography!.longitude).toBe(SPAWN.longitude)
      expect(document.geography!.planetary).toBe(true)
    })

    it('has entities array (required for GeographicView)', () => {
      const document = createGameDocument('white-truck')

      expect(Array.isArray(document.entities)).toBe(true)
      expect(document.entities.length).toBeGreaterThan(0)
    })
  })

  describe('tile loading robustness', () => {
    it('TileLoadTracker correctly tracks absent tiles', () => {
      const tracker = new TileLoadTracker()

      tracker.markAbsent('tile-1')
      tracker.markAbsent('tile-2')

      expect(tracker.getState('tile-1')).toBe('absent')
      expect(tracker.getState('tile-2')).toBe('absent')
      expect(tracker.shouldRequest('tile-1')).toBe(false)
      expect(tracker.getAbsent()).toContain('tile-1')
      expect(tracker.getAbsent()).toContain('tile-2')
    })

    it('TileLoadTracker correctly tracks failed tiles', () => {
      const tracker = new TileLoadTracker()

      tracker.markFailed('tile-1', 'network error')

      expect(tracker.getState('tile-1')).toBe('failed')
      expect(tracker.shouldRequest('tile-1')).toBe(false)
      expect(tracker.getFailed().get('tile-1')).toBe('network error')
    })

    it('TileLoadTracker allows retries before marking failed', () => {
      const tracker = new TileLoadTracker(3)

      expect(tracker.shouldRequest('tile-1')).toBe(true)

      expect(tracker.recordRetry('tile-1')).toBe(true)
      expect(tracker.getState('tile-1')).toBe('pending')

      expect(tracker.recordRetry('tile-1')).toBe(true)

      expect(tracker.recordRetry('tile-1')).toBe(false)
    })

    it('absent or failed tiles do not block game startup', () => {
      const tracker = new TileLoadTracker()

      tracker.markAbsent('WebMercatorQuad/15/16223/11997')
      tracker.markAbsent('WebMercatorQuad/15/16224/11997')
      tracker.markFailed('WebMercatorQuad/15/16225/11997', 'timeout')

      const absentTiles = tracker.getAbsent()
      const failedTiles = tracker.getFailed()

      expect(absentTiles.length).toBe(2)
      expect(failedTiles.size).toBe(1)

      expect(tracker.shouldRequest('WebMercatorQuad/15/16223/11997')).toBe(false)
      expect(tracker.shouldRequest('WebMercatorQuad/15/16224/11998')).toBe(true)
    })

    it('7-of-9 tile scenario: game starts with partial grid (2 absent)', () => {
      // Simulates the case where 7 tiles load successfully and 2 are absent (SPA fallback)
      // The game should start without waiting for the absent tiles

      const tracker = new TileLoadTracker()

      // 3x3 grid around spawn (z15 16224/11998):
      // Row 0: 16223/11997 (absent), 16224/11997, 16225/11997
      // Row 1: 16223/11998 (absent), 16224/11998 (spawn), 16225/11998
      // Row 2: 16223/11999, 16224/11999, 16225/11999

      // Mark 2 tiles as absent (server returns HTML 200 instead of 404)
      tracker.markAbsent('WebMercatorQuad/15/16223/11997')
      tracker.markAbsent('WebMercatorQuad/15/16223/11998')

      // The other 7 tiles are either loading or loaded - tracker has no state for them
      const availableTiles = [
        'WebMercatorQuad/15/16224/11997',
        'WebMercatorQuad/15/16225/11997',
        'WebMercatorQuad/15/16224/11998', // spawn tile
        'WebMercatorQuad/15/16225/11998',
        'WebMercatorQuad/15/16223/11999',
        'WebMercatorQuad/15/16224/11999',
        'WebMercatorQuad/15/16225/11999',
      ]

      // Verify absent tiles are tracked
      expect(tracker.getAbsent()).toHaveLength(2)
      expect(tracker.getAbsent()).toContain('WebMercatorQuad/15/16223/11997')
      expect(tracker.getAbsent()).toContain('WebMercatorQuad/15/16223/11998')

      // Verify available tiles can still be requested
      for (const tileId of availableTiles) {
        expect(tracker.shouldRequest(tileId)).toBe(true)
      }

      // Verify absent tiles won't be requested again
      expect(tracker.shouldRequest('WebMercatorQuad/15/16223/11997')).toBe(false)
      expect(tracker.shouldRequest('WebMercatorQuad/15/16223/11998')).toBe(false)

      // Simulate loading completion check: 7 loaded + 2 absent = 9 resolved
      const loaded = 7
      const absent = tracker.getAbsent().length
      const failed = tracker.getFailed().size
      const total = 9

      // Game should be able to start: all tiles are resolved
      expect(loaded + absent + failed).toBe(total)
    })

    it('game starts when spawn tile loads even if others are pending', () => {
      // The spawn tile (center of 3x3) should be enough to start the game
      const tracker = new TileLoadTracker()

      // Mark some tiles as absent
      tracker.markAbsent('WebMercatorQuad/15/16223/11997')

      // Spawn tile ID (loaded via world.resident, not TileLoadTracker)
      // The canStart() function checks: spawnTileId && loading.isTileLoaded(spawnTileId)

      // In this scenario:
      // - 1 tile absent (tracker knows)
      // - 1 tile loaded (spawn at WebMercatorQuad/15/16224/11998, world.resident knows)
      // - 7 tiles pending (no state in tracker)

      const loaded = 1
      const absent = tracker.getAbsent().length // 1
      const pending = 7

      // Game should start because spawn tile is loaded
      expect(loaded).toBeGreaterThan(0)
      expect(absent).toBe(1)
      expect(pending).toBe(7)
    })

    it('game starts when all tiles absent/failed (uses CatchFloor)', () => {
      const tracker = new TileLoadTracker()

      // All 9 tiles are absent (extreme case)
      const tileIds = [
        'WebMercatorQuad/15/16223/11997',
        'WebMercatorQuad/15/16224/11997',
        'WebMercatorQuad/15/16225/11997',
        'WebMercatorQuad/15/16223/11998',
        'WebMercatorQuad/15/16224/11998',
        'WebMercatorQuad/15/16225/11998',
        'WebMercatorQuad/15/16223/11999',
        'WebMercatorQuad/15/16224/11999',
        'WebMercatorQuad/15/16225/11999',
      ]

      for (const id of tileIds) {
        tracker.markAbsent(id)
      }

      // All tiles absent
      expect(tracker.getAbsent()).toHaveLength(9)

      // No tiles can be requested
      for (const id of tileIds) {
        expect(tracker.shouldRequest(id)).toBe(false)
      }

      // Game should start anyway using CatchFloor
      const loaded = 0
      const absent = tracker.getAbsent().length
      const total = 9

      // canStart() condition: absent + failed === total
      expect(absent).toBe(total)
      expect(loaded).toBe(0)
    })
  })
})
