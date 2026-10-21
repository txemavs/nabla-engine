/**
 * Runs a whole {@link Simulation} (Rapier world plus the fixed 1/60 s tick loop) behind a message
 * port, so the physics can live in a Web Worker.
 *
 * The complete simulation moves, not just the Rapier step: every fixed tick interleaves gameplay
 * code with synchronous physics queries (raycasts, sweeps, contacts, grounding, constraints), so
 * splitting the step from the tick would change ordering and behaviour. Inside the host the tick
 * runs exactly as it does inline; the main thread only exchanges commands and snapshots.
 *
 * {@link serveSimulation} is the worker side, {@link WorkerSimulation} the main-thread proxy.
 * The inline {@link Simulation} stays the default and the fallback for tests and Node.
 */
import { initPhysics } from './physics.js'
import { Simulation, type PlayerInput } from './simulation.js'
import type { SceneDocument } from '../scene/document.js'
import type { Transform, Vec3Tuple } from '../entity/schema.js'
import { QueryWorldExporter, type QueryWorldDelta } from './query-world.js'

/** Minimal message port shape shared by `Worker`, `DedicatedWorkerGlobalScope` and `MessagePort`. */
export interface SimulationPort {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener?(type: 'message', listener: (event: MessageEvent) => void): void
  start?(): void
}

type SimulationOptions = ConstructorParameters<typeof Simulation>[1]

/** Main thread to host. Commands are applied in order before the next step. */
export type SimulationRequest =
  | {
      id: number
      type: 'create'
      scene: SceneDocument
      options?: SimulationOptions
      /** Also send {@link SimulationReads} and a {@link QueryWorldDelta} with every snapshot. */
      mirror?: boolean
    }
  | { id: number; type: 'step'; elapsed: number; input?: PlayerInput; waterLevel?: number }
  | { id: number; type: 'call'; method: string; args: unknown[]; quiet?: boolean }
  /** Assign a public field (e.g. `terrainSupportPaused`). */
  | { id: number; type: 'set'; property: string; value: unknown }
  /** Scenery pole handles live in the host; the main thread refers to them by number. */
  | { id: number; type: 'pole'; pole: number; op: 'create'; args: unknown[] }
  | {
      id: number
      type: 'pole'
      pole: number
      op: 'impact' | 'restore' | 'dispose'
      args: unknown[]
    }
  | { id: number; type: 'dispose' }

/** State read by the render side after a step: the same values the inline getters return. */
export interface SimulationSnapshot {
  player: Simulation['player']
  stats: Simulation['stats']
  renderPlayerPosition: Vec3Tuple
  playerFrame: Transform | null
  /** Entity id → [fixed pose, interpolated pose]. */
  entities: Record<string, [Transform, Transform]>
  /** Vehicle id → [fixed wheel poses, interpolated wheel poses]. */
  wheels: Record<string, [Transform[], Transform[]]>
}

/** A request before the proxy numbers it. */
type UnnumberedRequest = SimulationRequest extends infer R
  ? R extends SimulationRequest
    ? Omit<R, 'id'>
    : never
  : never

/** Synchronous reads a mirrored proxy answers locally, evaluated in the host after each change. */
export interface SimulationReads {
  portalEvent: Simulation['portalEvent']
  playerEjection: Simulation['playerEjection']
  playerBikeRecovery: Simulation['playerBikeRecovery']
  stance: Simulation['stance']
  eyeOffset: number
  terrainSupportPaused: boolean
  nearestVehicle: string | null
  vehicleList: ReturnType<Simulation['vehicleList']>
  catchDisk: Transform | null
  /** Explosions drained in the host since the previous reply. */
  explosions: ReturnType<Simulation['consumeExplosions']>
  /** Scenery pole id → current pose. */
  poles: Record<number, { position: Vec3Tuple; rotation: [number, number, number, number] }>
  portals: Record<string, ReturnType<Simulation['portalState']>>
  velocities: Record<string, Vec3Tuple>
  /** Vehicle id → per-vehicle reads. A read that threw stores its error message instead. */
  vehicles: Record<string, VehicleReads>
}

export interface VehicleReads {
  info: ReturnType<Simulation['vehicleInfo']> | { error: string }
  infoInterpolated: ReturnType<Simulation['vehicleInfo']> | { error: string }
  wheelContacts: ReturnType<Simulation['wheelContactInfo']>
  spec: ReturnType<Simulation['vehicleSpec']>
  feedback: ReturnType<Simulation['vehicleFeedback']>
  damage: ReturnType<Simulation['vehicleDamage']>
  cargoCount: number
  cargoTrailer: string | null
}

type PoleHandle = ReturnType<Simulation['createSceneryPole']>

const attempt = <T>(read: () => T): T | { error: string } => {
  try {
    return read()
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** Evaluate every synchronous read the game makes, in the host, right after a step or command. */
export function readSimulation(
  sim: Simulation,
  poles: ReadonlyMap<number, PoleHandle> = new Map(),
): SimulationReads {
  const vehicles: SimulationReads['vehicles'] = {}
  const list = sim.vehicleList()
  for (const { id } of list)
    vehicles[id] = {
      info: attempt(() => sim.vehicleInfo(id)),
      infoInterpolated: attempt(() => sim.vehicleInfo(id, true)),
      wheelContacts: sim.wheelContactInfo(id),
      spec: sim.vehicleSpec(id),
      feedback: sim.vehicleFeedback(id),
      damage: sim.vehicleDamage(id),
      cargoCount: sim.cargoCount(id),
      cargoTrailer: sim.cargoTrailer(id),
    }
  const velocities: SimulationReads['velocities'] = {}
  for (const id of sim.entityIds()) velocities[id] = sim.entityVelocity(id)
  const portals: SimulationReads['portals'] = {}
  for (const id of sim.portalIds()) portals[id] = sim.portalState(id)
  const poleReads: SimulationReads['poles'] = {}
  for (const [id, handle] of poles) poleReads[id] = handle.pose()
  return {
    portalEvent: sim.portalEvent,
    playerEjection: sim.playerEjection,
    playerBikeRecovery: sim.playerBikeRecovery,
    stance: sim.stance,
    eyeOffset: sim.eyeOffset,
    terrainSupportPaused: sim.terrainSupportPaused,
    nearestVehicle: sim.nearestVehicle(),
    vehicleList: list,
    catchDisk: sim.catchDisk(),
    explosions: sim.consumeExplosions(),
    poles: poleReads,
    portals,
    velocities,
    vehicles,
  }
}

export type SimulationReply =
  | {
      id: number
      ok: true
      value?: unknown
      snapshot?: SimulationSnapshot
      reads?: SimulationReads
      query?: QueryWorldDelta
    }
  | { id: number; ok: false; name: string; message: string }

/** Take the snapshot the main thread mirrors. Exported so tests can compare it with inline. */
export function snapshotSimulation(sim: Simulation): SimulationSnapshot {
  const entities: SimulationSnapshot['entities'] = {}
  for (const id of sim.entityIds())
    entities[id] = [sim.entityTransform(id), sim.entityTransform(id, true)]
  const wheels: SimulationSnapshot['wheels'] = {}
  for (const { id } of sim.vehicleList())
    wheels[id] = [sim.wheelTransforms(id), sim.wheelTransforms(id, true)]
  return {
    player: sim.player,
    stats: sim.stats,
    renderPlayerPosition: sim.renderPlayerPosition,
    playerFrame: sim.playerFrame,
    entities,
    wheels,
  }
}

/** Worker side: own one {@link Simulation} and answer requests on `port`. */
export function serveSimulation(port: SimulationPort): void {
  let sim: Simulation | null = null
  let exporter: QueryWorldExporter | null = null
  const poles = new Map<number, PoleHandle>()
  const reply = (message: SimulationReply) => {
    const transfer = message.ok && message.query ? [message.query.poses.buffer] : []
    ;(port.postMessage as (m: unknown, t?: Transferable[]) => void)(message, transfer)
  }
  const state = (simulation: Simulation) => ({
    snapshot: snapshotSimulation(simulation),
    ...(exporter
      ? { reads: readSimulation(simulation, poles), query: exporter.export(simulation) }
      : {}),
  })
  const handle = async (message: SimulationRequest): Promise<SimulationReply> => {
    switch (message.type) {
      case 'create':
        await initPhysics()
        sim?.dispose()
        poles.clear()
        sim = new Simulation(message.scene, message.options)
        exporter = message.mirror ? new QueryWorldExporter() : null
        return { id: message.id, ok: true, ...state(sim) }
      case 'step':
        if (!sim) throw new Error('Simulation not created')
        if (message.input) sim.setInput(message.input)
        if (message.waterLevel !== undefined) sim.setWaterLevel(message.waterLevel)
        sim.step(message.elapsed)
        return { id: message.id, ok: true, ...state(sim) }
      case 'set':
        if (!sim) throw new Error('Simulation not created')
        ;(sim as unknown as Record<string, unknown>)[message.property] = message.value
        return { id: message.id, ok: true, ...state(sim) }
      case 'pole': {
        if (!sim) throw new Error('Simulation not created')
        if (message.op === 'create') {
          const [position, height, movable] = message.args as Parameters<
            Simulation['createSceneryPole']
          >
          poles.set(message.pole, sim.createSceneryPole(position, height, movable))
        } else {
          const pole = poles.get(message.pole)
          if (pole) (pole[message.op] as (...a: unknown[]) => void)(...message.args)
          if (message.op === 'dispose') poles.delete(message.pole)
        }
        return { id: message.id, ok: true, ...state(sim) }
      }
      case 'call': {
        if (!sim) throw new Error('Simulation not created')
        const target = (sim as unknown as Record<string, unknown>)[message.method]
        const value =
          typeof target === 'function'
            ? (target as (...args: unknown[]) => unknown).apply(sim, message.args)
            : target
        // Commands can change state, so the snapshot is refreshed after every call.
        // Quiet commands skip the state; the next step (or a loud call) carries it.
        if (message.quiet) return { id: message.id, ok: true, value: structuredClone(value) }
        return { id: message.id, ok: true, value: structuredClone(value), ...state(sim) }
      }
      case 'dispose':
        sim?.dispose()
        sim = null
        exporter = null
        poles.clear()
        return { id: message.id, ok: true }
    }
  }
  // Requests are handled strictly in arrival order, exactly like inline calls.
  let queue = Promise.resolve()
  port.addEventListener('message', (event: MessageEvent<SimulationRequest>) => {
    const message = event.data
    queue = queue.then(() =>
      handle(message).then(reply, (error: unknown) =>
        reply({
          id: message.id,
          ok: false,
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
        }),
      ),
    )
  })
  port.start?.()
}

/**
 * Main-thread proxy for a {@link Simulation} hosted by {@link serveSimulation}.
 *
 * Reads (`player`, `entityTransform`, `wheelTransforms`, ...) come from the latest snapshot and
 * are synchronous. Awaiting {@link step} gives the same values inline would give after that step;
 * a frame loop that does not await reads the previous step's snapshot (one frame of latency).
 * Any other method goes through {@link call}, asynchronously, in order with the steps.
 */
export class WorkerSimulation {
  private nextId = 1
  private pending = new Map<number, { resolve: (v: SimulationReply) => void }>()
  private latest: SimulationSnapshot | null = null
  private readonly listener = (event: MessageEvent<SimulationReply>) => {
    const reply = event.data
    const entry = this.pending.get(reply.id)
    if (!entry) return
    this.pending.delete(reply.id)
    if (reply.ok && reply.snapshot) this.latest = reply.snapshot
    if (reply.ok) this.onState?.(reply)
    entry.resolve(reply)
  }
  /** Called with every successful reply, before its promise settles (mirrors hook in here). */
  onState: ((reply: Extract<SimulationReply, { ok: true }>) => void) | null = null
  constructor(readonly port: SimulationPort) {
    port.addEventListener('message', this.listener)
    port.start?.()
  }
  /** Send any request; replies are applied in order. */
  request(message: UnnumberedRequest): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (reply) => {
          if (reply.ok) resolve(reply.value)
          else reject(Object.assign(new Error(reply.message), { name: reply.name }))
        },
      })
      this.port.postMessage({ ...message, id } as SimulationRequest)
    })
  }
  async create(scene: SceneDocument, options?: SimulationOptions, mirror = false): Promise<void> {
    await this.request({ type: 'create', scene, options, mirror })
  }
  async step(elapsed: number, input?: PlayerInput, waterLevel?: number): Promise<void> {
    await this.request({ type: 'step', elapsed, input, waterLevel })
  }
  /** Run any {@link Simulation} method (or read a property) in the host; results are cloned. */
  call<K extends keyof Simulation>(
    method: K,
    ...args: Simulation[K] extends (...a: infer A) => unknown ? A : []
  ): Promise<Simulation[K] extends (...a: never[]) => infer R ? Awaited<R> : Simulation[K]> {
    return this.request({ type: 'call', method, args }) as never
  }
  async dispose(): Promise<void> {
    await this.request({ type: 'dispose' })
    this.port.removeEventListener?.('message', this.listener)
    this.latest = null
  }
  get snapshot(): SimulationSnapshot {
    if (!this.latest) throw new Error('Simulation not created')
    return this.latest
  }
  get player(): Simulation['player'] {
    return this.snapshot.player
  }
  get stats(): Simulation['stats'] {
    return this.snapshot.stats
  }
  get renderPlayerPosition(): Vec3Tuple {
    return this.snapshot.renderPlayerPosition
  }
  get playerFrame(): Transform | null {
    return this.snapshot.playerFrame
  }
  entityTransform(id: string, interpolated = false): Transform {
    const pair = this.snapshot.entities[id]
    if (!pair) throw new Error('Unknown entity: ' + id)
    return pair[interpolated ? 1 : 0]
  }
  wheelTransforms(id: string, interpolated = false): Transform[] {
    return this.snapshot.wheels[id]?.[interpolated ? 1 : 0] ?? []
  }
}

/** Start a module worker hosting the simulation (Vite worker import, as for Atlas packages). */
export function createWorkerSimulation(): WorkerSimulation {
  return new WorkerSimulation(
    new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }),
  )
}
