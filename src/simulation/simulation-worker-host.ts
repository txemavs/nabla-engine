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
import { SnapshotTimeline, lerpAngle, lerpTransform, lerpVec } from './snapshot-clock.js'
import { initPhysics } from './physics.js'
import { FIXED_STEP, Simulation, type PlayerInput } from './simulation.js'
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
  /** `orElse`: when the method answers null/undefined, call this one (same args) instead. */
  | { id: number; type: 'call'; method: string; args: unknown[]; quiet?: boolean; orElse?: string }
  /**
   * `setPlanetTiles` by id: `added` carries only tiles the host has not been sent (or whose
   * object changed); the rest are reused from its cache. Ids not listed are dropped from it.
   */
  | { id: number; type: 'tiles'; ids: string[]; added: unknown[] }
  /** Hot-reloaded terrain: prepare answers whether a commit is ready; commit applies it. */
  | { id: number; type: 'planet'; op: 'prepare'; previousId: string; tile: unknown }
  | { id: number; type: 'planet'; op: 'commit' }
  /**
   * `capturePlanetSupport` with heights the render side sampled under each actor ([x, y, z,
   * ground]): the host samples the nearest one. `restore` runs the captured restore by token.
   */
  | { id: number; type: 'support'; op: 'capture'; token: number; heights: number[][] }
  | { id: number; type: 'support'; op: 'restore'; token: number }
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
  groundHeld: boolean
  roadAssist: Simulation['roadAssist']
  collisionStats: Simulation['collisionStats']
  sceneryActors: Vec3Tuple[]
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
  engineMode: ReturnType<Simulation['engineMode']>
  twoWheeledPose: ReturnType<Simulation['twoWheeledPose']>
  forkliftPose: ReturnType<Simulation['forkliftPose']>
  wheelVisualState: ReturnType<Simulation['wheelVisualState']>
  angularVelocity: Vec3Tuple
  hitchCandidate: string | null
  dockingCandidate: string | null
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
      engineMode: sim.engineMode(id),
      twoWheeledPose: sim.twoWheeledPose(id),
      forkliftPose: sim.forkliftPose(id),
      wheelVisualState: sim.wheelVisualState(id),
      angularVelocity: sim.entityAngularVelocity(id),
      hitchCandidate: sim.hitchCandidate(id),
      dockingCandidate: sim.dockingCandidate(id),
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
    groundHeld: sim.groundHeld,
    roadAssist: { ...sim.roadAssist },
    collisionStats: sim.collisionStats,
    sceneryActors: sim.sceneryActors(),
  }
}

/** Nearest sampled ground height within 1 m (horizontally) of `position`. */
export function sampledHeight(
  heights: readonly number[][],
  position: Vec3Tuple,
): number | undefined {
  let best: number | undefined
  let nearest = 1
  for (const [x, , z, ground] of heights) {
    const d = Math.hypot(x - position[0], z - position[2])
    if (d <= nearest) {
      nearest = d
      best = ground
    }
  }
  return best
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
  const supports = new Map<number, () => void>()
  let planetCommit: (() => void) | undefined
  let tiles = new Map<string, { id: string }>()
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
        supports.clear()
        planetCommit = undefined
        tiles = new Map()
        sim = new Simulation(message.scene, message.options)
        exporter = message.mirror ? new QueryWorldExporter() : null
        return { id: message.id, ok: true, ...state(sim) }
      case 'step':
        if (!sim) throw new Error('Simulation not created')
        if (message.input) sim.setInput(message.input)
        if (message.waterLevel !== undefined) sim.setWaterLevel(message.waterLevel)
        {
          const started = performance.now()
          sim.step(message.elapsed)
          // The step's own cost (ms), for ?performanceLog=1.
          const stepMs = performance.now() - started
          return { id: message.id, ok: true, value: stepMs, ...state(sim) }
        }
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
      case 'tiles': {
        if (!sim) throw new Error('Simulation not created')
        const next = new Map<string, { id: string }>()
        for (const tile of message.added as { id: string }[]) next.set(tile.id, tile)
        for (const id of message.ids)
          if (!next.has(id) && tiles.has(id)) next.set(id, tiles.get(id)!)
        tiles = next
        sim.setPlanetTiles(
          message.ids.flatMap((id) => (tiles.has(id) ? [tiles.get(id)!] : [])) as Parameters<
            Simulation['setPlanetTiles']
          >[0],
        )
        return { id: message.id, ok: true }
      }
      case 'planet': {
        if (!sim) throw new Error('Simulation not created')
        if (message.op === 'prepare') {
          planetCommit = sim.preparePlanetReplacement(
            message.previousId,
            message.tile as Parameters<Simulation['preparePlanetReplacement']>[1],
          )
          return { id: message.id, ok: true, value: !!planetCommit }
        }
        const commit = planetCommit
        planetCommit = undefined
        commit?.()
        return { id: message.id, ok: true, value: !!commit, ...state(sim) }
      }
      case 'support': {
        if (!sim) throw new Error('Simulation not created')
        if (message.op === 'capture') {
          const heights = message.heights
          supports.set(
            message.token,
            sim.capturePlanetSupport((p) => sampledHeight(heights, p)),
          )
          return { id: message.id, ok: true }
        }
        const restore = supports.get(message.token)
        supports.delete(message.token)
        restore?.()
        return { id: message.id, ok: true, ...state(sim) }
      }
      case 'call': {
        if (!sim) throw new Error('Simulation not created')
        if (message.method === 'discardPlanetReplacement') planetCommit = undefined
        const run = (method: string) => {
          const target = (sim as unknown as Record<string, unknown>)[method]
          return typeof target === 'function'
            ? (target as (...args: unknown[]) => unknown).apply(sim, message.args)
            : target
        }
        let value = run(message.method)
        if (value == null && message.orElse) value = run(message.orElse)
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
        supports.clear()
        planetCommit = undefined
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
  /**
   * Pipelined mode ({@link ThreadedSimulation.advance}): interpolated reads blend the last two
   * snapshots at this clock's render time instead of reading the worker's own blend.
   */
  readonly timeline = new SnapshotTimeline<SimulationSnapshot>(2 * FIXED_STEP)
  pipelined = false
  /** The blended snapshot of the current render time (rebuilt when it or the buffer changes). */
  private rendered: {
    time: number | null
    latest: SimulationSnapshot
    snapshot: SimulationSnapshot
  } | null = null
  private readonly listener = (event: MessageEvent<SimulationReply>) => {
    const reply = event.data
    const entry = this.pending.get(reply.id)
    if (!entry) return
    this.pending.delete(reply.id)
    if (reply.ok && reply.snapshot) {
      this.latest = reply.snapshot
      this.timeline.push(reply.snapshot, reply.snapshot.stats.ticks * FIXED_STEP)
    }
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
  /** Step in the host; resolves with the step's own cost in ms once its state is mirrored. */
  async step(elapsed: number, input?: PlayerInput, waterLevel?: number): Promise<number> {
    return Number(await this.request({ type: 'step', elapsed, input, waterLevel })) || 0
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
  /** Latest snapshot, or null before the first step. */
  get snapshotOrNull(): SimulationSnapshot | null {
    return this.latest
  }
  get snapshot(): SimulationSnapshot {
    if (!this.latest) throw new Error('Simulation not created')
    return this.latest
  }
  get player(): Simulation['player'] {
    return this.view().player
  }
  get stats(): Simulation['stats'] {
    return this.snapshot.stats
  }
  /**
   * The state every main-thread read sees. Inline-equivalent (newest worker reply) until frames
   * pipeline; then the snapshot blended at the timeline's render time, so camera, player,
   * vehicles, wheels and attached objects all share one timeline.
   */
  private view(): SimulationSnapshot {
    const latest = this.snapshot
    if (!this.pipelined) return latest
    const time = this.timeline.renderTime
    const cached = this.rendered
    if (cached && cached.time === time && cached.latest === latest) return cached.snapshot
    const snapshot = blendSnapshot(latest, this.timeline.sample())
    this.rendered = { time, latest, snapshot }
    return snapshot
  }
  /** Newest worker reply, whatever the render time (pending-entity checks, structural reads). */
  get newest(): SimulationSnapshot {
    return this.snapshot
  }
  get renderPlayerPosition(): Vec3Tuple {
    return this.view().renderPlayerPosition
  }
  get playerFrame(): Transform | null {
    return this.view().playerFrame
  }
  entityTransform(id: string, interpolated = false): Transform {
    const pair = this.view().entities[id]
    if (!pair) throw new Error('Unknown entity: ' + id)
    return pair[interpolated ? 1 : 0]
  }
  wheelTransforms(id: string, interpolated = false): Transform[] {
    return this.view().wheels[id]?.[interpolated ? 1 : 0] ?? []
  }
}

/** Start a module worker hosting the simulation (Vite worker import, as for Atlas packages). */
export function createWorkerSimulation(): WorkerSimulation {
  return new WorkerSimulation(
    new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }),
  )
}

/**
 * `latest` with every pose replaced by its blend at `sample` (fixed and interpolated slots get
 * the same pose: one timeline). Ids, stats and discrete state stay those of the newest reply.
 */
export function blendSnapshot(
  latest: SimulationSnapshot,
  sample: {
    a: { snapshot: SimulationSnapshot; time: number }
    b: { snapshot: SimulationSnapshot; time: number }
    t: number
  } | null,
): SimulationSnapshot {
  if (!sample) return latest
  const { a, b, t } = sample
  const span = b.time - a.time
  const pose = (from: Transform | undefined, to: Transform | undefined, fallback: Transform) =>
    from && to ? lerpTransform(from, to, t, span) : fallback
  const entities: SimulationSnapshot['entities'] = {}
  for (const [id, pair] of Object.entries(latest.entities)) {
    const blended = pose(a.snapshot.entities[id]?.[0], b.snapshot.entities[id]?.[0], pair[1])
    entities[id] = [blended, blended]
  }
  const wheels: SimulationSnapshot['wheels'] = {}
  for (const [id, pair] of Object.entries(latest.wheels)) {
    const from = a.snapshot.wheels[id]?.[0],
      to = b.snapshot.wheels[id]?.[0]
    const blended =
      from && to && from.length === to.length && to.length === pair[0].length
        ? to.map((wheel, i) => lerpTransform(from[i], wheel, t, span))
        : pair[1]
    wheels[id] = [blended, blended]
  }
  const pa = a.snapshot.player,
    pb = b.snapshot.player
  const sameBody = pa.vehicleId === pb.vehicleId && pb.vehicleId === latest.player.vehicleId
  const player = sameBody
    ? {
        ...latest.player,
        position: lerpVec(pa.position, pb.position, t),
        yaw: lerpAngle(pa.yaw, pb.yaw, t),
      }
    : latest.player
  // The worker's `renderPlayerPosition` is its own interpolated pose at reply time (a fraction of
  // a tick that varies per reply), not the pose at the snapshot's fixed time. Blending it on the
  // fixed timeline made the driven car jump against the camera. In a vehicle the player is the
  // body, so use the body's pose blended from the fixed snapshots, exactly what its mesh shows.
  const driven = sameBody && pb.vehicleId ? entities[pb.vehicleId]?.[0] : undefined
  const renderPlayerPosition: Vec3Tuple = driven
    ? [driven.position[0], driven.position[1], driven.position[2]]
    : sameBody
      ? lerpVec(a.snapshot.renderPlayerPosition, b.snapshot.renderPlayerPosition, t)
      : latest.renderPlayerPosition
  const fa = a.snapshot.playerFrame,
    fb = b.snapshot.playerFrame
  const playerFrame = sameBody && fa && fb ? lerpTransform(fa, fb, t, span) : latest.playerFrame
  return { ...latest, entities, wheels, player, renderPlayerPosition, playerFrame }
}
