import { expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { parseScene } from '../../src/scene/document.js'

it('delivers strong launch and reaches 250 km/h on a level straight', () => {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [10000, 1, 10000]
  const sim = new Simulation(
    parseScene({
      version: 1,
      name: 'Speed benchmark',
      entities: [
        floor,
        presetVehicle('car', 's3', [0, 0.62, 0]),
        createEntity('spawn', 'spawn', [0, 1, 4]),
      ],
    }),
  )
  try {
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    sim.startInVehicle('s3')
    sim.setInput({ ...idleInput(), forward: 1 })
    let to100 = 0,
      to200 = 0,
      to250 = 0
    for (let i = 1; i <= 3600; i++) {
      sim.step(1 / 60)
      const speed = sim.vehicleInfo('s3').speedKmh
      if (!to100 && speed >= 100) to100 = i / 60
      if (!to200 && speed >= 200) to200 = i / 60
      if (!to250 && speed >= 250) to250 = i / 60
    }
    console.log({ to100, to200, to250, final: sim.vehicleInfo('s3').speedKmh })
    expect(to100).toBeGreaterThan(0)
    expect(to100).toBeLessThan(5)
    expect(to250).toBeGreaterThan(0)
    expect(to250).toBeLessThan(35)
    expect(sim.entityTransform('s3').position.every(Number.isFinite)).toBe(true)
  } finally {
    sim.dispose()
  }
})
