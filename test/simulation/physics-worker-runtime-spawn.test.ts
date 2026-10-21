import { describe, expect, it, vi } from 'vitest'
import { initPhysics } from '../../src/simulation/physics.js'
import {
  serveSimulation,
  type SimulationPort,
} from '../../src/simulation/simulation-worker-host.js'
import { ThreadedSimulation, threadedSimulation } from '../../src/simulation/threaded-simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import type { SceneDocument } from '../../src/scene/document.js'

async function threaded() {
  await initPhysics()
  const ground = createEntity('ground', 'box', [0, -0.5, 0])
  ground.size = [200, 1, 200]
  const doc: SceneDocument = {
    version: 1,
    name: 'Runtime spawn',
    entities: [ground, createEntity('spawn', 'spawn', [0, 0.05, 4])],
  }
  const channel = new MessageChannel()
  serveSimulation(channel.port2 as unknown as SimulationPort)
  const sim = await ThreadedSimulation.start(doc, {}, channel.port1 as unknown as SimulationPort)
  await sim.step(1 / 60)
  return {
    sim,
    close() {
      sim.dispose()
      channel.port1.close()
      channel.port2.close()
    },
  }
}

describe('physics worker: entities spawned at runtime', () => {
  it('reads a vehicle spawned after start before and after the worker registers it', async () => {
    const { sim, close } = await threaded()
    const car = presetVehicle('car', 'spawned-1', [3, 1, -2])
    sim.addVehicles([car])
    // Same frame as the spawn (the bug: 'Unknown entity: spawned-1' killed the boot).
    expect(sim.entityTransform('spawned-1', true).position).toEqual([3, 1, -2])
    expect(sim.entityIds()).toContain('spawned-1')
    const ready = threadedSimulation(sim)!.whenEntities(['spawned-1'])
    await sim.step(1 / 60)
    await ready
    expect(sim.vehicleList().map((v) => v.id)).toContain('spawned-1')
    expect(sim.vehicleInfo('spawned-1').speedKmh).toBeLessThan(5)
    close()
  })

  it('drops a command that names an unknown entity instead of failing the next step', async () => {
    const { sim, close } = await threaded()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sim.removeVehicle('spawned-404')
    await expect(sim.step(1 / 60)).resolves.toBeUndefined()
    await expect(sim.step(1 / 60)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      '[physics-worker] dropped command:',
      expect.stringMatching(/Unknown|No vehicle/),
    )
    warn.mockRestore()
    close()
  })
})
