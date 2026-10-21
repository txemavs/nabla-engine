import { describe, expect, it } from 'vitest'
import { Simulation, idleInput, type PlayerInput } from '../../src/simulation/simulation.js'
import { initPhysics } from '../../src/simulation/physics.js'
import {
  serveSimulation,
  snapshotSimulation,
  type SimulationPort,
} from '../../src/simulation/simulation-worker-host.js'
import {
  ThreadedSimulation,
  physicsWorkerEnabled,
  threadedSimulation,
} from '../../src/simulation/threaded-simulation.js'
import { createEntity, type Entity, type Vec3Tuple } from '../../src/entity/schema.js'
import type { SceneDocument } from '../../src/scene/document.js'

/** A MessageChannel gives the same structured-clone boundary as a Web Worker. */
async function threaded(doc: SceneDocument) {
  await initPhysics()
  const channel = new MessageChannel()
  serveSimulation(channel.port2 as unknown as SimulationPort)
  const sim = await ThreadedSimulation.start(
    structuredClone(doc),
    {},
    channel.port1 as unknown as SimulationPort,
  )
  return {
    sim,
    close() {
      sim.dispose()
      channel.port1.close()
      channel.port2.close()
    },
  }
}

function scene(extra: Entity[]): SceneDocument {
  const ground = createEntity('ground', 'box', [0, -0.5, 0])
  ground.size = [200, 1, 200]
  return {
    version: 1,
    name: 'Query parity',
    entities: [ground, createEntity('spawn', 'spawn', [0, 0.05, 4]), ...extra],
  }
}

/** A deterministic fan of rays around a few origins (horizontal, downward and diagonal). */
function rays(): { origin: Vec3Tuple; direction: Vec3Tuple }[] {
  const out: { origin: Vec3Tuple; direction: Vec3Tuple }[] = []
  for (const origin of [
    [0, 1, 4],
    [3, 2, -2],
    [-4, 5, 0],
    [0, 12, 0],
  ] as Vec3Tuple[])
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      out.push({ origin, direction: [Math.cos(a), -0.15 * (i % 4), Math.sin(a)] })
    }
  return out
}

/** Every synchronous read and query the game makes, as plain data. */
function observe(sim: Simulation) {
  // The render reads every pose each frame (wheel poses refresh the wheel transform cache), as
  // the worker host does when it snapshots; do the same inline so both caches agree.
  if (!threadedSimulation(sim)) snapshotSimulation(sim)
  const vehicles = sim.vehicleList().map(({ id }) => ({
    id,
    info: sim.vehicleInfo(id),
    infoInterpolated: sim.vehicleInfo(id, true),
    wheels: sim.wheelContactInfo(id),
    feedback: sim.vehicleFeedback(id),
    damage: sim.vehicleDamage(id),
  }))
  const hits = rays().map(({ origin, direction }) => sim.shoot(origin, direction, 60, 0))
  const excluded = rays()
    .slice(0, 12)
    .map(({ origin, direction }) => sim.shoot(origin, direction, 60, 0, 'target'))
  const camera = rays()
    .slice(0, 24)
    .map(({ origin, direction }) =>
      sim.cameraPosition(origin, [
        origin[0] + direction[0] * 8,
        origin[1] + direction[1] * 8,
        origin[2] + direction[2] * 8,
      ]),
    )
  return {
    player: sim.player,
    stats: sim.stats,
    stance: sim.stance,
    nearest: sim.nearestVehicle(),
    ejection: sim.playerEjection,
    portalEvent: sim.portalEvent,
    vehicles,
    hits,
    excluded,
    camera,
  }
}

/**
 * Reads come straight from the worker and must match inline exactly. Query answers must hit the
 * same entity (or nothing) everywhere; their coordinates may differ by float32 rounding only,
 * because Rapier renormalises a quaternion when the mirror sets a collider's rotation while the
 * stepped world keeps the integrator's (not exactly unit) one.
 */
const QUERY_EPSILON = 1e-5
type Observed = ReturnType<typeof observe>
function expectSameQueries(seen: Observed, expected: Observed): void {
  const { hits, excluded, camera, ...reads } = seen
  const { hits: h, excluded: x, camera: c, ...expectedReads } = expected
  expect(reads).toEqual(expectedReads)
  for (const [a, b] of [
    [hits, h],
    [excluded, x],
  ] as const) {
    expect(a.map((hit) => hit?.entityId ?? 'miss')).toEqual(b.map((hit) => hit?.entityId ?? 'miss'))
  }
  expect(deviation(seen, expected)).toBeLessThan(QUERY_EPSILON)
}
/** Largest coordinate difference between two observations' query answers, in metres. */
function deviation(seen: Observed, expected: Observed): number {
  let worst = 0
  const walk = (a: unknown, b: unknown): void => {
    if (typeof a === 'number' && typeof b === 'number') worst = Math.max(worst, Math.abs(a - b))
    else if (a && b && typeof a === 'object')
      for (const key of Object.keys(a)) walk((a as never)[key], (b as never)[key])
  }
  walk([seen.hits, seen.excluded, seen.camera], [expected.hits, expected.excluded, expected.camera])
  return worst
}

async function compare(
  doc: SceneDocument,
  frames: number,
  input: (frame: number) => PlayerInput,
  setup?: (sim: Simulation) => void,
) {
  await initPhysics()
  const inline = new Simulation(structuredClone(doc))
  const { sim, close } = await threaded(doc)
  setup?.(inline)
  setup?.(sim)
  await threadedSimulation(sim)!.refresh()
  expectSameQueries(observe(sim), observe(inline))
  let hits = 0
  let worst = 0
  for (let frame = 0; frame < frames; frame++) {
    const elapsed = [1 / 60, 1 / 144, 1 / 30, 0.1][frame % 4]
    for (const s of [inline, sim]) {
      s.setInput(input(frame))
      s.setWaterLevel(0)
    }
    inline.step(elapsed)
    await sim.step(elapsed)
    const ids = inline.entityIds()
    expect(ids.map((id) => sim.entityTransform(id, true))).toEqual(
      ids.map((id) => inline.entityTransform(id, true)),
    )
    const seen = observe(sim)
    const expected = observe(inline)
    expectSameQueries(seen, expected)
    worst = Math.max(worst, deviation(seen, expected))
    hits += seen.hits.filter(Boolean).length
  }
  expect(snapshotSimulation(inline).entities).toEqual(
    threadedSimulation(sim)!.worker.snapshot.entities,
  )
  return { inline, sim, hits, worst, close }
}

describe('physics worker with a main-thread query world', () => {
  it('is off unless ?physicsWorker=1', () => {
    expect(physicsWorkerEnabled('')).toBe(false)
    expect(physicsWorkerEnabled('?physicsWorker=0')).toBe(false)
    expect(physicsWorkerEnabled('?quality=low&physicsWorker=1')).toBe(true)
  })

  it('answers raycasts identically while bodies fall and tumble', async () => {
    const crates = [0, 1, 2, 3].map((i) => {
      const crate = createEntity('crate-' + i, 'box', [i * 1.5 - 2, 3 + i * 2, -1 + i * 0.3])
      crate.size = [1, 1, 1]
      crate.motion = 'dynamic'
      crate.mass = 20
      return crate
    })
    const target = createEntity('target', 'box', [0, 1, -6])
    target.size = [2, 2, 0.5]
    const { hits, worst, close } = await compare(scene([...crates, target]), 120, () => idleInput())
    expect(hits).toBeGreaterThan(120 * 20)
    console.info(`query parity: ${hits} hits, worst deviation ${worst} m`)
    close()
  })

  it('walks, jumps and queries identically', async () => {
    const target = createEntity('target', 'box', [0, 1, -6])
    target.size = [2, 2, 0.5]
    const { close } = await compare(scene([target]), 120, (f) => ({
      ...idleInput(),
      forward: f < 60 ? 1 : 0,
      yaw: f * 0.01,
      jump: f === 80,
    }))
    close()
  })

  it('drives a vehicle with the occupied body excluded identically', async () => {
    const car = createEntity('car', 'vehicle', [0, 1, 0])
    const target = createEntity('target', 'box', [0, 1, -12])
    target.size = [3, 2, 0.5]
    const { inline, sim, close } = await compare(
      scene([car, target]),
      200,
      (f) => ({ ...idleInput(), forward: f < 150 ? 1 : -1, right: f > 60 && f < 120 ? 0.5 : 0 }),
      (s) => s.startInVehicle('car'),
    )
    expect(sim.player.vehicleId).toBe('car')
    expect(sim.wheelTransforms('car', true)).toEqual(inline.wheelTransforms('car', true))
    close()
  })

  it('mirrors external collision meshes (trimesh) and their removal', async () => {
    await initPhysics()
    const doc = scene([])
    const inline = new Simulation(structuredClone(doc))
    const { sim, close } = await threaded(doc)
    const vertices = new Float32Array([-5, 0, -10, 5, 0, -10, 0, 6, -10])
    const indices = new Uint32Array([0, 1, 2])
    for (const s of [inline, sim]) s.setExternalCollisionMesh('wall', vertices, indices)
    inline.step(1 / 60)
    await sim.step(1 / 60)
    const ray = (s: Simulation) => s.shoot([0, 2, 0], [0, 0, -1], 30, 0)
    expect(ray(sim)).toEqual(ray(inline))
    expect(ray(sim)?.point[2]).toBeCloseTo(-10, 4)
    for (const s of [inline, sim]) s.setExternalCollisionMesh('wall', null)
    inline.step(1 / 60)
    await sim.step(1 / 60)
    expect(ray(sim)).toEqual(ray(inline))
    expect(ray(sim)).toBeNull()
    inline.dispose()
    close()
  })

  it('applies shot impulses in the worker like inline', async () => {
    await initPhysics()
    const crate = createEntity('crate', 'box', [0, 0.5, -5])
    crate.size = [1, 1, 1]
    crate.motion = 'dynamic'
    crate.mass = 20
    const doc = scene([crate])
    const inline = new Simulation(structuredClone(doc))
    const { sim, close } = await threaded(doc)
    for (let f = 0; f < 30; f++) {
      inline.step(1 / 60)
      await sim.step(1 / 60)
    }
    const a = inline.shoot([0, 0.5, 0], [0, 0, -1], 20, 12)
    const b = sim.shoot([0, 0.5, 0], [0, 0, -1], 20, 12)
    expect(b).toEqual(a)
    expect(b?.entityId).toBe('crate')
    for (let f = 0; f < 30; f++) {
      inline.step(1 / 60)
      await sim.step(1 / 60)
      expect(sim.entityTransform('crate', true)).toEqual(inline.entityTransform('crate', true))
    }
    expect(sim.entityTransform('crate').position[2]).toBeLessThan(-5.01)
    inline.dispose()
    close()
  })

  it('surfaces worker command errors on the next step', async () => {
    const { sim, close } = await threaded(scene([]))
    sim.startInVehicle('missing')
    await expect(sim.step(1 / 60)).rejects.toThrow()
    close()
  })
})
