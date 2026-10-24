import fs from 'node:fs'
import { expect, it } from 'vitest'
import { vehiclePreset } from '../../src/catalog/vehicles/library.js'

it('ships a road car with independent body, steering and correctly ordered wheel assets', () => {
  const preset = vehiclePreset('car')
  const hubs = preset.vehicle.hubs!
  expect(hubs).toHaveLength(4)
  expect(hubs[0][0]).toBeLessThan(0)
  expect(hubs[1][0]).toBeGreaterThan(0)
  expect(hubs[0][2]).toBeLessThan(0)
  expect(hubs[2]![2]).toBeGreaterThan(0)
  expect(preset.visual.wheel).toBeDefined()
  for (const part of [preset.visual.body, preset.visual.wheel!, preset.visual.steering!]) {
    expect(fs.existsSync('assets' + part.url), part.url).toBe(true)
  }
})
