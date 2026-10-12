import fs from 'node:fs'
import { expect, it } from 'vitest'
import { presetVehicle, vehiclePreset } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation } from '../../src/simulation/simulation.js'

it('has an attributed reduced asset and independent correctly ordered wheels', () => {
  const manifest = JSON.parse(fs.readFileSync('assets/library/cars/ferrari-j50/asset.json', 'utf8'))
  expect(manifest.afterTriangles).toBeLessThan(manifest.beforeTriangles * 0.3)
  expect(manifest.attribution.license).toContain('CC-BY-4.0')
  expect(manifest.removedHiddenEngineTriangles).toBeGreaterThan(20000)
  const preset = vehiclePreset('ferrari-j50')
  expect(preset.vehicle.hubs).toHaveLength(4)
  const hubs = preset.vehicle.hubs!
  expect(hubs[0][0]).toBeLessThan(0)
  expect(hubs[1][0]).toBeGreaterThan(0)
  expect(hubs[0][2]).toBeLessThan(0)
  expect(hubs[2]![2]).toBeGreaterThan(0)
  expect(preset.visual.wheels).toHaveLength(4)
  for (const part of [preset.visual.body, ...preset.visual.wheels!, preset.visual.steering!]) {
    expect(fs.existsSync('assets' + part.url)).toBe(true)
  }
})

it('installs as a road vehicle and settles upright on its suspension', () => {
  const ground = createEntity('ground', 'box', [0, -0.5, 0])
  ground.size = [100, 1, 100]
  const car = presetVehicle('ferrari-j50', 'ferrari', [0, 0.6, 0])
  const sim = new Simulation(
    { version: 1, name: 'Ferrari', entities: [ground, createEntity('spawn', 'spawn', [10, 1, 0])] },
    { playerMode: 'walk' },
  )
  sim.addVehicles([car])
  for (let i = 0; i < 180; i++) sim.step(1 / 60)
  const pose = sim.entityTransform('ferrari')
  expect(pose.position[1]).toBeGreaterThan(0.4)
  expect(pose.position[1]).toBeLessThan(0.8)
  expect(Math.abs(pose.rotation[3])).toBeGreaterThan(0.99)
  sim.dispose()
})
