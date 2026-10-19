import { describe, expect, it } from 'vitest'
import { Simulation, idleInput, type PlayerInput } from '../../src/simulation/simulation.js'
import {
  WorkerSimulation,
  serveSimulation,
  snapshotSimulation,
  type SimulationPort,
} from '../../src/simulation/simulation-worker-host.js'
import { createEntity, type Entity } from '../../src/entity/schema.js'
import type { SceneDocument } from '../../src/scene/document.js'

/** A MessageChannel gives the same structured-clone boundary a Web Worker has. */
function hosted(): { proxy: WorkerSimulation; close(): void } {
  const channel = new MessageChannel()
  serveSimulation(channel.port2 as unknown as SimulationPort)
  const proxy = new WorkerSimulation(channel.port1 as unknown as SimulationPort)
  return {
    proxy,
    close() {
      channel.port1.close()
      channel.port2.close()
    },
  }
}

function scene(extra: Entity[], spawn: [number, number, number] = [0, 0.05, 4]): SceneDocument {
  const ground = createEntity('ground', 'box', [0, -0.5, 0])
  ground.size = [200, 1, 200]
  return {
    version: 1,
    name: 'Worker parity',
    entities: [ground, createEntity('spawn', 'spawn', spawn), ...extra],
  }
}

/** Drive both simulations frame by frame with irregular frame times and compare every snapshot. */
async function compare(
  doc: SceneDocument,
  frames: number,
  input: (frame: number) => PlayerInput,
  setup?: (sim: Simulation) => void,
  setupProxy?: (proxy: WorkerSimulation) => Promise<void>,
): Promise<{ inline: Simulation; proxy: WorkerSimulation; close(): void }> {
  const inline = new Simulation(structuredClone(doc))
  const { proxy, close } = hosted()
  await proxy.create(structuredClone(doc))
  setup?.(inline)
  await setupProxy?.(proxy)
  expect(proxy.snapshot).toEqual(snapshotSimulation(inline))
  for (let frame = 0; frame < frames; frame++) {
    // Irregular frames exercise the accumulator, the 4-substep cap and interpolation.
    const elapsed = [1 / 60, 1 / 144, 1 / 30, 0.1][frame % 4]
    inline.setInput(input(frame))
    inline.setWaterLevel(0)
    inline.step(elapsed)
    await proxy.step(elapsed, input(frame), 0)
    expect(proxy.snapshot).toEqual(snapshotSimulation(inline))
  }
  return { inline, proxy, close }
}

describe('physics worker parity', () => {
  it('drops a dynamic body identically', async () => {
    const crate = createEntity('crate', 'box', [2, 6, 0])
    crate.size = [1, 1, 1]
    crate.motion = 'dynamic'
    crate.mass = 20
    const { inline, proxy, close } = await compare(scene([crate]), 120, () => idleInput())
    expect(proxy.entityTransform('crate').position[1]).toBe(
      inline.entityTransform('crate').position[1],
    )
    expect(proxy.stats.ticks).toBeGreaterThan(100)
    expect(proxy.entityTransform('crate').position[1]).toBeLessThan(1.5)
    inline.dispose()
    await proxy.dispose()
    close()
  })

  it('walks and grounds the player identically', async () => {
    const { inline, proxy, close } = await compare(scene([]), 120, (f) => ({
      ...idleInput(),
      forward: f < 60 ? 1 : 0,
      yaw: f * 0.01,
      jump: f === 80,
    }))
    expect(proxy.player).toEqual(inline.player)
    expect(proxy.player.grounded).toBe(true)
    inline.dispose()
    await proxy.dispose()
    close()
  })

  it('drives a vehicle for a few seconds identically', async () => {
    const car = createEntity('car', 'vehicle', [0, 1, 0])
    const { inline, proxy, close } = await compare(
      scene([car]),
      200,
      (f) => ({ ...idleInput(), forward: f < 150 ? 1 : -1, right: f > 60 && f < 120 ? 0.5 : 0 }),
      (sim) => sim.startInVehicle('car'),
      (p) => p.call('startInVehicle', 'car'),
    )
    expect(proxy.player.vehicleId).toBe('car')
    expect(proxy.wheelTransforms('car', true)).toEqual(inline.wheelTransforms('car', true))
    expect(Math.hypot(...proxy.player.position)).toBeGreaterThan(1)
    inline.dispose()
    await proxy.dispose()
    close()
  })

  it('answers raycast queries identically', async () => {
    const target = createEntity('target', 'box', [0, 1, -6])
    target.size = [2, 2, 0.5]
    const { inline, proxy, close } = await compare(scene([target]), 30, () => idleInput())
    const hit = await proxy.call('shoot', [0, 1, 4], [0, 0, -1], 20, 0)
    expect(hit).toEqual(inline.shoot([0, 1, 4], [0, 0, -1], 20, 0))
    expect(hit?.entityId).toBe('target')
    inline.dispose()
    await proxy.dispose()
    close()
  })

  it('reports host errors to the caller', async () => {
    const { proxy, close } = hosted()
    await expect(proxy.step(1 / 60)).rejects.toThrow('Simulation not created')
    close()
  })
})
