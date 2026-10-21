import { describe, expect, expectTypeOf, it } from 'vitest'
import { initPhysics } from '../../src/simulation/physics.js'
import {
  serveSimulation,
  type SimulationPort,
} from '../../src/simulation/simulation-worker-host.js'
import {
  ThreadedSimulation,
  type UnansweredInWorker,
} from '../../src/simulation/threaded-simulation.js'
import { Simulation } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import type { SceneDocument } from '../../src/scene/document.js'
import { readFileSync } from 'node:fs'

/** Private members exist on the prototype at runtime; only the public API is answered. */
const privateNames = new Set(
  [
    ...readFileSync(
      new URL('../../src/simulation/simulation.ts', import.meta.url),
      'utf8',
    ).matchAll(/^  (?:private|protected) (?:readonly |static |async |get |set )*(\w+)/gm),
  ].map((m) => m[1]),
)

function scene(): SceneDocument {
  const ground = createEntity('ground', 'box', [0, -0.5, 0])
  ground.size = [200, 1, 200]
  return {
    version: 1,
    name: 'Worker answers',
    entities: [ground, createEntity('spawn', 'spawn', [0, 0.05, 4])],
  }
}

async function threaded() {
  await initPhysics()
  const channel = new MessageChannel()
  serveSimulation(channel.port2 as unknown as SimulationPort)
  const sim = await ThreadedSimulation.start(
    scene(),
    {},
    channel.port1 as unknown as SimulationPort,
  )
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

const prototypeMembers = (proto: object) =>
  Object.entries(Object.getOwnPropertyDescriptors(proto)).filter(
    ([key]) => key !== 'constructor' && !privateNames.has(key),
  )

describe('physics worker: every value a Simulation answers is answered in worker mode', () => {
  it('leaves no value-returning method or property to the void forwarder (tsc enforces it)', () => {
    expectTypeOf<UnansweredInWorker>().toBeNever()
  })

  it('defines every method that answers a value inline', async () => {
    await initPhysics()
    const inline = new Simulation(scene(), {})
    const own = new Set(Object.getOwnPropertyNames(ThreadedSimulation.prototype))
    const missing: string[] = []
    for (const [key, descriptor] of prototypeMembers(Simulation.prototype)) {
      if (typeof descriptor.value !== 'function' || own.has(key)) continue
      if (/^(dispose|step)$/.test(key)) continue
      let value: unknown
      try {
        value = (descriptor.value as () => unknown).call(inline)
      } catch {
        continue
      }
      if (value !== undefined) missing.push(key)
    }
    inline.dispose()
    expect(missing).toEqual([])
  })

  it('answers every Simulation getter (none reads undefined)', async () => {
    const { sim, close } = await threaded()
    const unanswered = prototypeMembers(Simulation.prototype)
      .filter(([, d]) => d.get)
      .map(([key]) => key)
      .filter((key) => (sim as unknown as Record<string, unknown>)[key] === undefined)
    expect(unanswered).toEqual([])
    close()
  })

  it('answers per-vehicle reads, HUD commands and terrain hooks without undefined', async () => {
    const { sim, close } = await threaded()
    sim.addVehicles([presetVehicle('car', 'car-1', [3, 1, -2])])
    await sim.step(1 / 60)
    expect(sim.engineMode('car-1')).toBe('normal')
    expect(sim.twoWheeledPose('car-1')).toBeNull()
    expect(sim.entityAngularVelocity('car-1')).toHaveLength(3)
    expect(sim.sceneryActors()).toBeInstanceOf(Array)
    expect(sim.toggleHitch()).toBeNull() // on foot, as inline
    expect(sim.interact()).toBe('')
    expect(sim.toggleFlight()).toBe('')
    expect(sim.liftNearbyBike()).toBe(false)
    expect(typeof sim.setEntityKinematic('car-1', false)).toBe('boolean')
    const restore = sim.capturePlanetSupport(() => 0)
    expect(typeof restore).toBe('function')
    restore()
    expect(() => sim.queryState()).toThrow(/inline-only/)
    await expect(sim.step(1 / 60)).resolves.toBeUndefined()
    close()
  })
})
