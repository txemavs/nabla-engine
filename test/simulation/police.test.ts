import { expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { parseScene } from '../../src/scene/document.js'
import { hasLocalPreset } from '../local-presets.js'
it.skipIf(!hasLocalPreset('police'))(
  'settles the police Focus and drives with its own wheels and chassis',
  () => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [100, 1, 100]
    const car = presetVehicle('police', 'police', [0, 0.69, 0])
    const doc = parseScene({
      version: 1,
      name: 'Police',
      entities: [floor, car, createEntity('spawn', 'spawn', [0, 1, 4])],
    })
    const sim = new Simulation(doc, { playerMode: 'hover' })
    try {
      for (let i = 0; i < 180; i++) sim.step(1 / 60)
      const start = sim.entityTransform('police').position
      expect(start[1]).toBeGreaterThan(0.4)
      expect(start[1]).toBeLessThan(0.72)
      sim.startInVehicle('police')
      sim.setInput({ ...idleInput(), forward: 1 })
      for (let i = 0; i < 180; i++) sim.step(1 / 60)
      const end = sim.entityTransform('police').position
      expect(Math.hypot(end[0] - start[0], end[2] - start[2])).toBeGreaterThan(4)
      expect(end.every(Number.isFinite)).toBe(true)
    } finally {
      sim.dispose()
    }
  },
)
