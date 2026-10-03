import { describe, expect, it } from 'vitest'
import { vehiclePresets, vehiclePreset } from '../../src/catalog/vehicles/library.js'
import { readVehiclePresetSources } from '../../src/catalog/vehicles/preset-source.js'

describe('vehicle presets', () => {
  it('loads all presets from assets/studio without schema errors', () => {
    const sources = readVehiclePresetSources()
    expect(sources.length).toBeGreaterThan(0)

    // This will throw if any preset fails schema validation
    const presets = vehiclePresets()
    expect(presets.length).toBe(sources.length)
  })

  it('validates every preset has required fields', () => {
    for (const preset of vehiclePresets()) {
      expect(preset.id).toMatch(/^[a-z0-9-]{1,40}$/)
      expect(preset.label).toBeTruthy()
      expect(preset.name).toBeTruthy()
      expect(preset.mass).toBeGreaterThan(0)
      expect(preset.vehicle).toBeDefined()
      expect(preset.visual).toBeDefined()
      expect(preset.vehicle.colliders.length).toBeGreaterThan(0)
      // Must have either hubs or hubConfigs
      expect(preset.vehicle.hubs || preset.vehicle.hubConfigs).toBeTruthy()
    }
  })

  it('can load each preset by id', () => {
    for (const preset of vehiclePresets()) {
      const loaded = vehiclePreset(preset.id)
      expect(loaded.id).toBe(preset.id)
    }
  })

  it('filters out non-preset JSON files', () => {
    // The white-truck-studio.json manifest should NOT be loaded as a preset
    const sources = readVehiclePresetSources()
    const hasManifest = sources.some((s) => s.file.includes('white-truck-studio.json'))
    expect(hasManifest).toBe(false)
  })

  it('includes the white-truck tractor preset', () => {
    const presets = vehiclePresets()
    const whiteTruck = presets.find((p) => p.id === 'white-truck')
    expect(whiteTruck).toBeDefined()
    expect(whiteTruck!.label).toBe('White Truck (MAN TGX)')
  })
})
