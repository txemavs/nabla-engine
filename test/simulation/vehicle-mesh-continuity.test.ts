import { describe, expect, it } from 'vitest'
import { initPhysics } from '../../src/simulation/physics.js'
import {
  serveSimulation,
  type SimulationPort,
} from '../../src/simulation/simulation-worker-host.js'
import { ThreadedSimulation, threadedSimulation } from '../../src/simulation/threaded-simulation.js'
import { idleInput } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import type { SceneDocument } from '../../src/scene/document.js'

function doc(): SceneDocument {
  const ground = createEntity('ground', 'box', [0, -0.5, 0])
  ground.size = [2000, 1, 2000]
  return {
    version: 1,
    name: 'Vehicle mesh',
    entities: [ground, createEntity('spawn', 'spawn', [0, 0.05, 4])],
  }
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Pipelined worker physics, driving at irregular frame times and reply latencies: the car mesh
 * moves evenly frame to frame and the camera target (renderPlayerPosition) stays on the mesh,
 * so the car never jumps against the camera.
 */
describe('worker physics: driven vehicle mesh is continuous', () => {
  it('mesh and camera target move together, without jumps', async () => {
    await initPhysics()
    const channel = new MessageChannel()
    serveSimulation(channel.port2 as unknown as SimulationPort)
    const sim = await ThreadedSimulation.start(
      doc(),
      {},
      channel.port1 as unknown as SimulationPort,
    )
    try {
      sim.addVehicles([presetVehicle('car', 'car-1', [0, 1, -10])])
      await sim.step(1 / 60)
      sim.startInVehicle('car-1')
      await threadedSimulation(sim)!.refresh()
      let seed = 3
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
      const speeds: number[] = []
      const gaps: number[] = []
      let prev: number[] | null = null
      for (let f = 0; f < 240; f++) {
        const dt = (1000 / 60 + (rnd() - 0.5) * 4) / 1000
        sim.setInput({ ...idleInput(), forward: 1, yaw: 0 })
        threadedSimulation(sim)!.advance(dt)
        await wait(rnd() < 0.2 ? 12 : 3)
        const mesh = sim.entityTransform('car-1', true).position
        const target = sim.renderPlayerPosition
        gaps.push(Math.hypot(mesh[0] - target[0], mesh[1] - target[1], mesh[2] - target[2]))
        if (prev && f > 120) speeds.push(Math.hypot(mesh[0] - prev[0], mesh[2] - prev[2]) / dt)
        prev = [...mesh]
      }
      // Speed from one frame to the next changes smoothly (accelerating car, no pose steps).
      const steps = speeds.slice(1).map((v, i) => Math.abs(v - speeds[i]))
      const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length
      expect(mean).toBeGreaterThan(5)
      expect(Math.max(...steps)).toBeLessThan(mean * 0.15)
      // The camera target is the car body: it never drifts off the mesh.
      expect(Math.max(...gaps.slice(60))).toBeLessThan(1e-6)
    } finally {
      sim.dispose()
      channel.port1.close()
      channel.port2.close()
    }
  })
})
