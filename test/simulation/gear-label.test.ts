import { describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { s3Instruments } from '../../src/catalog/monitors/s3-instruments.js'
import { createEntity } from '../../src/entity/schema.js'
import { gearLabel } from '../../src/entity/vehicle/gear-label.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'

describe('gear indicator text', () => {
  it('shows R, D<n> in automatic and M<n> in manual', () => {
    expect(gearLabel(-1, false)).toBe('R')
    expect(gearLabel(-1, true)).toBe('R')
    expect(gearLabel(1, false)).toBe('D1')
    expect(gearLabel(4, false)).toBe('D4')
    expect(gearLabel(1, true)).toBe('M1')
    expect(gearLabel(6, true)).toBe('M6')
  })

  it('the car cluster uses the same text for every gear and mode', () => {
    for (const manual of [false, true])
      for (const gear of [-1, 1, 2, 3, 7])
        expect(
          s3Instruments.clusterData({ speedKmh: 40, rpm: 2000, gear, load: 0.2, manual }).values
            .gear,
        ).toBe(gearLabel(gear, manual))
  })

  it('follows the live vehicle: D while automatic, M after a paddle, D again on resume', () => {
    const floor = createEntity('floor', 'box', [0, -0.5, -4000])
    floor.size = [10000, 1, 10000]
    const sim = new Simulation({
      version: 1,
      name: 'Gear label',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [5, 1, 0]),
        presetVehicle('car', 's3', [0, 1.45, 0]),
      ],
    })
    try {
      for (let i = 0; i < 180; i++) sim.step(1 / 60)
      sim.startInVehicle('s3')
      const label = () => {
        const info = sim.vehicleInfo('s3')
        return gearLabel(info.gear, info.manualTransmission)
      }
      expect(label()).toBe('D1')
      sim.setInput({ ...idleInput(), forward: 1 })
      for (let i = 0; i < 60 * 4; i++) sim.step(1 / 60)
      const auto = sim.vehicleInfo('s3').gear
      expect(auto).toBeGreaterThan(1)
      expect(label()).toBe(`D${auto}`)
      sim.shiftVehicle(1)
      expect(label()).toBe(`M${auto + 1}`)
      for (let i = 0; i < 60 * 4; i++) sim.step(1 / 60)
      expect(label()).toMatch(/^M\d$/)
      sim.automaticTransmission()
      expect(label()).toMatch(/^D\d$/)
    } finally {
      sim.dispose()
    }
  })
})
