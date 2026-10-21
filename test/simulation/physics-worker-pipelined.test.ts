import { describe, expect, it } from 'vitest'
import { initPhysics } from '../../src/simulation/physics.js'
import {
  serveSimulation,
  type SimulationPort,
} from '../../src/simulation/simulation-worker-host.js'
import { ThreadedSimulation, threadedSimulation } from '../../src/simulation/threaded-simulation.js'
import { FIXED_STEP } from '../../src/simulation/simulation.js'
import { lerpTransform } from '../../src/simulation/snapshot-clock.js'
import { PerspectiveCamera } from 'three'
import { createGameCameraState, updateGameCamera } from '../../src/runtime/game-camera.js'
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
  it('every camera mode reads the blended pose of the render timeline', async () => {
    const { sim, threaded: t, close } = await threaded()
    sim.addVehicles([presetVehicle('car', 'car-1', [0, 3, -10])])
    await sim.step(1 / 60)
    const view = {
      document: { version: 1, name: 'cams', entities: [] },
      objects: new Map(),
      vehicleHeadOffset: () => [0, 0, 0] as [number, number, number],
    }
    const blended = (id: string) => {
      const s = t.worker.timeline.sample()!
      return lerpTransform(
        s.a.snapshot.entities[id][0],
        s.b.snapshot.entities[id][0],
        s.t,
        s.b.time - s.a.time,
      )
    }
    const seen: string[] = []
    // Record every pose the camera reads and compare it with the timeline's blend there and then.
    const spy = new Proxy(sim, {
      get(target, key) {
        const value = Reflect.get(target, key)
        if (key === 'entityTransform')
          return (id: string, interpolated?: boolean) => {
            const pose = (value as typeof sim.entityTransform).call(target, id, interpolated)
            const want = blended(id)
            pose.position.forEach((v, i) => expect(v).toBeCloseTo(want.position[i], 6))
            seen.push(`entity:${id}`)
            return pose
          }
        if (key === 'vehicleInfo')
          return (id: string, interpolated?: boolean) => {
            seen.push(`info:${id}`)
            return (value as typeof sim.vehicleInfo).call(target, id, interpolated)
          }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    for (const vehicle of [false, true]) {
      if (vehicle) sim.startInVehicle('car-1')
      for (const [mode, firstPerson] of [
        ['chase', false],
        ['chase', true],
        ['cockpit', false],
        ['map', false],
        ['cinematic', false],
      ] as const) {
        const state = createGameCameraState()
        state.mode = mode
        state.firstPerson = firstPerson
        const camera = new PerspectiveCamera(60, 1.6)
        for (let i = 0; i < 6; i++) {
          t.advance(FIXED_STEP * (0.5 + (i % 3) * 0.4))
          await tick()
          const player = sim.player
          updateGameCamera(spy, view as never, camera, state, 1000 + i * 16, 1 / 60)
          // Same pose: the player the camera centres on is the timeline's, not the newest reply's.
          expect(sim.renderPlayerPosition).toEqual(t.worker.renderPlayerPosition)
          if (player.vehicleId) {
            const shown = blended(player.vehicleId)
            const driver = sim.vehicleInfo(player.vehicleId, true).driver
            // The seat rides on the shown body: its offset from it is the worker's own offset.
            const raw = t.worker.newest.entities[player.vehicleId][1]
            const rawDriver = (
              t as unknown as {
                reads: { vehicles: Record<string, { infoInterpolated: { driver: number[] } }> }
              }
            ).reads.vehicles[player.vehicleId].infoInterpolated.driver
            const offset = Math.hypot(...driver.map((v, k) => v - shown.position[k]))
            const rawOffset = Math.hypot(...rawDriver.map((v, k) => v - raw.position[k]))
            expect(offset).toBeCloseTo(rawOffset, 4)
          }
          expect(camera.position.toArray().every(Number.isFinite)).toBe(true)
        }
      }
    }
    expect(seen.some((s) => s.startsWith('entity:car-1'))).toBe(true)
    // Worker-sampled scalars (velocity) also come from the timeline's two replies.
    const s = t.worker.timeline.sample()!
    expect(sim.entityVelocity('car-1').every(Number.isFinite)).toBe(true)
    expect(s.t).toBeGreaterThanOrEqual(0)
    close()
  })
})
