import { expect, it } from 'vitest'
import { createEntity } from '../../src/entity/schema.js'
import { type SceneDocument } from '../../src/scene/document.js'
import { Simulation } from '../../src/simulation/simulation.js'

it('hover on a planet does not accumulate lift into a launch', () => {
  const ground = createEntity('ground', 'box', [0, -0.5, 0])
  ground.size = [40, 1, 40]
  const scene: SceneDocument = {
    version: 1,
    name: 'p',
    geography: {
      latitude: 43.33,
      longitude: -1.82,
      altitude: 20,
      imagery: 'offline',
      planetary: true,
    },
    entities: [ground, createEntity('spawn', 'spawn', [0, 0.05, 0])],
  }
  const sim = new Simulation(scene, { playerMode: 'hover', planetaryTerrain: true })
  for (let i = 0; i < 180; i++) sim.step(1 / 60)
  expect(sim.player.position[1]).toBeGreaterThan(0.5)
  expect(sim.player.position[1]).toBeLessThan(4)
  sim.dispose()
})
