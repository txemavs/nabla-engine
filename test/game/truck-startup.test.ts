import { describe, it, expect } from 'vitest'
import { hasVehiclePreset, presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity, type SceneDocument } from '../../src/index.js'
import type { GeoPoint } from '../../src/math/geo/sphere.js'

describe('game startup with truck preset', () => {
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

  it('loads white-truck preset and creates valid game document', () => {
    expect(hasVehiclePreset('white-truck')).toBe(true)

    const document = createGameDocument('white-truck')

    expect(document.entities).toHaveLength(2)
    const vehicle = document.entities.find((e) => e.kind === 'vehicle')
    expect(vehicle).toBeDefined()
    expect(vehicle!.id).toBe('player-vehicle')
    expect(vehicle!.vehicle).toBeDefined()
    expect(vehicle!.vehicle!.hubConfigs).toHaveLength(4)
  })

  it('loads car preset and creates valid game document', () => {
    expect(hasVehiclePreset('car')).toBe(true)

    const document = createGameDocument('car')

    expect(document.entities).toHaveLength(2)
    const vehicle = document.entities.find((e) => e.kind === 'vehicle')
    expect(vehicle).toBeDefined()
    expect(vehicle!.id).toBe('player-vehicle')
    expect(vehicle!.vehicle).toBeDefined()
  })

  it('game document has proper geography section', () => {
    const document = createGameDocument('white-truck')

    expect(document.geography).toBeDefined()
    expect(document.geography!.latitude).toBe(SPAWN.latitude)
    expect(document.geography!.longitude).toBe(SPAWN.longitude)
    expect(document.geography!.planetary).toBe(true)
  })

  it('game document has entities array (required for GeographicView)', () => {
    const document = createGameDocument('white-truck')

    expect(Array.isArray(document.entities)).toBe(true)
    expect(document.entities.length).toBeGreaterThan(0)
  })
})
