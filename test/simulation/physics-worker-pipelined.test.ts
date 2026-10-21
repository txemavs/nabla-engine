import { describe, expect, it } from 'vitest'
import { initPhysics } from '../../src/simulation/physics.js'
import {
  serveSimulation,
  type SimulationPort,
} from '../../src/simulation/simulation-worker-host.js'
import { ThreadedSimulation, threadedSimulation } from '../../src/simulation/threaded-simulation.js'
import { FIXED_STEP } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import type { SceneDocument } from '../../src/scene/document.js'

async function threaded() {
  await initPhysics()
  const ground = createEntity('ground', 'box', [0, -0.5, 0])
  ground.size = [400, 1, 400]
  const doc: SceneDocument = {
    version: 1,
    name: 'Pipelined',
    entities: [ground, createEntity('spawn', 'spawn', [0, 0.05, 4])],
  }
  const channel = new MessageChannel()
  serveSimulation(channel.port2 as unknown as SimulationPort)
  const sim = await ThreadedSimulation.start(doc, {}, channel.port1 as unknown as SimulationPort)
  await sim.step(1 / 60)
  const port = threadedSimulation(sim)!.worker.port as unknown as {
    postMessage: (m: unknown) => void
  }
  const steps: unknown[] = []
  const post = port.postMessage.bind(port)
  port.postMessage = (m: unknown) => {
    if ((m as { type: string }).type === 'step') steps.push(m)
    post(m)
  }
  return {
    sim,
    threaded: threadedSimulation(sim)!,
    steps,
    close() {
      sim.dispose()
      channel.port1.close()
      channel.port2.close()
    },
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('physics worker: pipelined frames', () => {
  it('never waits: advance returns at once and keeps one step in flight', async () => {
    const { sim, threaded: t, steps, close } = await threaded()
    const ticks = sim.stats.ticks
    for (let i = 0; i < 10; i++) expect(t.advance(1 / 60)).toBeUndefined()
    // Ten frames in the same task: one step sent, the rest accumulated for the next.
    expect(steps).toHaveLength(1)
    for (let i = 0; i < 20 && sim.stats.ticks < ticks + 9; i++) await tick()
    expect(steps).toHaveLength(2)
    expect(sim.stats.ticks).toBeGreaterThanOrEqual(ticks + 9)
    expect(t.workerStepMs).toBeGreaterThanOrEqual(0)
    close()
  })

  it('every read shares one render timeline: vehicle, wheels, player and the camera seat', async () => {
    const { sim, threaded: t, close } = await threaded()
    sim.addVehicles([presetVehicle('car', 'car-1', [0, 3, -10])])
    await sim.step(1 / 60)
    for (let i = 0; i < 12; i++) {
      t.advance(FIXED_STEP)
      await tick()
    }
    const sample = t.worker.timeline.sample()!
    const from = sample.a.snapshot.entities['car-1'][0].position[1]
    const to = sample.b.snapshot.entities['car-1'][0].position[1]
    const shown = sim.entityTransform('car-1', true)
    expect(shown.position[1]).toBeCloseTo(from + (to - from) * sample.t, 5)
    // Fixed and interpolated reads are the same pose (no second timeline).
    expect(sim.entityTransform('car-1')).toEqual(shown)
    // The seat the camera follows rides on the shown body, not on the worker's newest pose.
    const info = sim.vehicleInfo('car-1', true)
    const worker = t.worker.newest.entities['car-1'][1]
    const seatWorker = info.driver[1] - shown.position[1]
    const reads = (
      t as unknown as {
        reads: { vehicles: Record<string, { infoInterpolated: { driver: number[] } }> }
      }
    ).reads
    const raw = reads.vehicles['car-1'].infoInterpolated.driver[1] - worker.position[1]
    expect(seatWorker).toBeCloseTo(raw, 3)
    close()
  })
})
