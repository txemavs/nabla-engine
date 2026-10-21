/**
 * Main-thread stand-in for a {@link Simulation} whose Rapier world and fixed tick run in a Web
 * Worker (`?physicsWorker=1`, off by default).
 *
 * - Commands (`interact`, `setInput`, `addVehicles`, ...) are forwarded to the worker in call order
 *   and applied there before the next step, exactly where inline code would have applied them.
 * - `step()` returns a promise; the frame awaits it before rendering, so the render always reads
 *   the state of the step it just asked for (no overlap, no extra latency).
 * - Reads (`player`, `entityTransform(id, true)`, `wheelTransforms(id, true)`, `vehicleInfo`, ...)
 *   come from the state the worker returns with every step: the same values inline getters give.
 * - Instant queries (`shoot`, `cameraPosition`) run synchronously against a {@link QueryWorld}: a
 *   never-stepped main-thread Rapier world whose colliders are synced from the worker every step.
 *
 * What cannot stay synchronous (documented in docs/physics-worker.md): return values of commands
 * (HUD messages, `liftNearbyBike()`, ...) are not available to the caller, `preparePlanetCollisions`
 * answers with the previous worker reply, and command errors surface on the next `step()` instead
 * of throwing at the call site. Reads after a command and before the next step see the state as of
 * the previous step.
 */
import { QueryWorld } from './query-world.js'
import {
  WorkerSimulation,
  createWorkerSimulation,
  type SimulationReads,
  type SimulationPort,
} from './simulation-worker-host.js'
import { Simulation, type PlayerInput } from './simulation.js'
import type { SceneDocument } from '../scene/document.js'
import type { Entity, Transform, Vec3Tuple } from '../entity/schema.js'

type SimulationOptions = ConstructorParameters<typeof Simulation>[1]

/** `?physicsWorker=1` turns the worker on; anything else (or no window) keeps physics inline. */
export function physicsWorkerEnabled(search = globalThis.location?.search ?? ''): boolean {
  return new URLSearchParams(search).get('physicsWorker') === '1'
}

/** Commands whose return value the game uses; answered with the worker's previous reply. */
const LAGGED_RESULTS = new Set(['preparePlanetCollisions'])

/** Commands that skip the round trip when called again with the same roads/areas (by identity). */
const IDENTITY_COMMANDS = new Set(['setSurfaceRoads', 'setSurfaceAreas'])

const vehicleError = (id: string) => new Error('Unknown vehicle: ' + id)

/** Commands that add entities: their ids exist here at once, in the worker after its next step. */
const ADDING_COMMANDS = new Set(['addVehicles', 'addPlaced'])
/** Commands that remove entities (by id or ids). */
const REMOVING_COMMANDS = new Set(['removeVehicle', 'removePlaced'])

/** A command that names an entity the worker no longer (or not yet) has: logged and dropped. */
export function isUnknownEntityError(error: unknown): boolean {
  return /^(Unknown (entity|vehicle|portal)|No vehicle)\b/.test(String((error as Error)?.message ?? error))
}

type Quat = Transform['rotation']
const mulQuat = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
const rotate = (q: Quat, v: Vec3Tuple): Vec3Tuple => {
  const r = mulQuat(mulQuat(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]])
  return [r[0], r[1], r[2]]
}

/** The worker-hosted stand-in behind `sim`, or null for an inline {@link Simulation}. */
export function threadedSimulation(sim: object | null | undefined): ThreadedSimulation | null {
  return sim instanceof ThreadedSimulation ? sim : null
}

export class ThreadedSimulation {
  readonly query = new QueryWorld()
  private reads: SimulationReads | null = null
  private explosions: SimulationReads['explosions'] = []
  private readonly lagged = new Map<string, unknown>()
  private readonly lastIdentity = new Map<string, unknown[]>()
  private failure: unknown = null
  private nextPole = 1
  private disposed = false
  /** Entities added here whose ids the worker's snapshot does not show yet. */
  private readonly pending = new Map<string, Entity>()
  private waiters: { ids: string[]; resolve: () => void }[] = []

  private constructor(
    readonly worker: WorkerSimulation,
    readonly options: NonNullable<SimulationOptions>,
    private readonly terminate: () => void,
  ) {
    worker.onState = (reply) => {
      if (reply.query) this.query.apply(reply.query)
      if (reply.reads) {
        this.reads = reply.reads
        this.explosions.push(...reply.reads.explosions)
      }
      if (reply.snapshot) this.settlePending(reply.snapshot.entities)
    }
  }

  /**
   * Start a worker-hosted simulation of `scene` and return it typed as a {@link Simulation}.
   * `port` lets tests host it over a MessageChannel instead of a real Worker.
   */
  static async start(
    scene: SceneDocument,
    options: SimulationOptions = {},
    port?: SimulationPort & { terminate?: () => void },
  ): Promise<Simulation> {
    const worker = port ? new WorkerSimulation(port) : createWorkerSimulation()
    const threaded = new ThreadedSimulation(worker, options ?? {}, () =>
      (worker.port as { terminate?: () => void }).terminate?.(),
    )
    await worker.create(scene, options, true)
    return threaded.facade()
  }

  /** Wrap in a Proxy so every other Simulation method becomes a forwarded command. */
  private facade(): Simulation {
    return new Proxy(this, {
      get: (target, key, receiver) => {
        if (typeof key === 'symbol' || key in target) return Reflect.get(target, key, receiver)
        // Read the descriptor: touching an accessor on the prototype would run it.
        const member = Object.getOwnPropertyDescriptor(Simulation.prototype, key)?.value
        if (typeof member === 'function') return (...args: unknown[]) => target.command(key, args)
        return target.state()[key as keyof SimulationReads]
      },
      set: (target, key, value) => {
        if (typeof key === 'symbol' || key in target) return Reflect.set(target, key, value)
        target.forward({ type: 'set', property: key, value })
        return true
      },
    }) as unknown as Simulation
  }

  private state(): SimulationReads {
    if (!this.reads) throw new Error('Simulation not created')
    return this.reads
  }

  private forward(message: Parameters<WorkerSimulation['request']>[0]): Promise<unknown> {
    const sent = this.worker.request(message)
    sent.catch((error: unknown) => {
      // A command racing a despawn (or naming an id the worker never had) is not fatal.
      if (isUnknownEntityError(error)) {
        console.warn(
          '[physics-worker] dropped command:',
          String((error as Error)?.message ?? error),
        )
        return
      }
      this.failure ??= error
    })
    return sent
  }

  private settlePending(entities: Record<string, unknown>): void {
    for (const id of [...this.pending.keys()]) if (id in entities) this.pending.delete(id)
    if (!this.waiters.length) return
    this.waiters = this.waiters.filter((waiter) => {
      if (waiter.ids.some((id) => this.pending.has(id))) return true
      waiter.resolve()
      return false
    })
  }

  /**
   * Resolves once the worker's snapshot holds `ids` (added with addVehicles/addPlaced), so a host
   * can register views that read vehicle state. Gives up after `timeoutMs` (reads then fall back
   * to the authored transform) rather than stalling the caller.
   */
  whenEntities(ids: readonly string[], timeoutMs = 5000): Promise<void> {
    const waiting = ids.filter((id) => this.pending.has(id))
    if (!waiting.length || this.disposed) return Promise.resolve()
    return new Promise((resolve) => {
      const waiter = { ids: waiting, resolve }
      this.waiters.push(waiter)
      setTimeout(() => {
        if (!this.waiters.includes(waiter)) return
        this.waiters = this.waiters.filter((w) => w !== waiter)
        console.warn('[physics-worker] entities not in the worker yet:', waiting.join(', '))
        resolve()
      }, timeoutMs)
    })
  }

  /** Authored world transform of a pending entity (parent chain composed). */
  private pendingTransform(id: string, interpolated: boolean): Transform | null {
    const entity = this.pending.get(id)
    if (!entity) return null
    const local = entity.transform
    if (!entity.parentId) return { position: [...local.position], rotation: [...local.rotation] }
    const parent = this.hasEntity(entity.parentId)
      ? this.entityTransform(entity.parentId, interpolated)
      : null
    if (!parent) return { position: [...local.position], rotation: [...local.rotation] }
    const offset = rotate(parent.rotation, local.position)
    return {
      position: [
        parent.position[0] + offset[0],
        parent.position[1] + offset[1],
        parent.position[2] + offset[2],
      ],
      rotation: mulQuat(parent.rotation, local.rotation),
    }
  }
  private hasEntity(id: string): boolean {
    return this.pending.has(id) || !!this.worker.snapshotOrNull?.entities[id]
  }

  private command(method: string, args: unknown[]): unknown {
    if (this.disposed) return undefined
    if (IDENTITY_COMMANDS.has(method)) {
      const next = args[0] ? [...(args[0] as Iterable<unknown>)] : []
      const last = this.lastIdentity.get(method)
      if (last && last.length === next.length && next.every((item, i) => item === last[i]))
        return undefined
      this.lastIdentity.set(method, next)
      args = [next]
    }
    if (ADDING_COMMANDS.has(method))
      for (const entity of (args[0] as Entity[] | undefined) ?? [])
        this.pending.set(entity.id, entity)
    if (REMOVING_COMMANDS.has(method))
      for (const id of [args[0]].flat() as string[]) this.pending.delete(id)
    const sent = this.forward({ type: 'call', method, args, quiet: true })
    if (LAGGED_RESULTS.has(method)) {
      sent.then(
        (value) => this.lagged.set(method, value),
        () => {},
      )
      return this.lagged.get(method) ?? false
    }
    return undefined
  }

  /** Wait for every forwarded command and mirror the resulting state. */
  async refresh(): Promise<void> {
    await this.worker.request({ type: 'call', method: 'entityIds', args: [] })
    this.throwFailure()
  }
  private throwFailure(): void {
    if (!this.failure) return
    const error = this.failure
    this.failure = null
    throw error
  }
  /** Advance the worker simulation; resolves once its state is mirrored here. */
  async step(elapsed: number): Promise<void> {
    this.throwFailure()
    await this.worker.step(elapsed)
    this.throwFailure()
  }
  setInput(input: PlayerInput): void {
    if (
      ![input.forward, input.right, input.yaw, input.lift ?? 0, input.turn ?? 0].every(
        Number.isFinite,
      )
    )
      throw new Error('Input must be finite')
    this.command('setInput', [input])
  }

  // Snapshot reads (same values as the inline getters after the latest step).
  get player(): Simulation['player'] {
    return this.worker.player
  }
  get stats(): Simulation['stats'] {
    return this.worker.stats
  }
  get renderPlayerPosition(): Vec3Tuple {
    return this.worker.renderPlayerPosition
  }
  get playerFrame(): Transform | null {
    return this.worker.playerFrame
  }
  entityTransform(id: string, interpolated = false): Transform {
    if (!this.worker.snapshotOrNull?.entities[id]) {
      const pending = this.pendingTransform(id, interpolated)
      if (pending) return pending
    }
    return this.worker.entityTransform(id, interpolated)
  }
  wheelTransforms(id: string, interpolated = false): Transform[] {
    return this.worker.wheelTransforms(id, interpolated)
  }
  entityIds(): string[] {
    const ids = Object.keys(this.worker.snapshot.entities)
    for (const id of this.pending.keys()) if (!ids.includes(id)) ids.push(id)
    return ids
  }
  get portalEvent(): Simulation['portalEvent'] {
    return this.state().portalEvent
  }
  get playerEjection(): Simulation['playerEjection'] {
    return this.state().playerEjection
  }
  get playerBikeRecovery(): Simulation['playerBikeRecovery'] {
    return this.state().playerBikeRecovery
  }
  get stance(): Simulation['stance'] {
    return this.state().stance
  }
  get eyeOffset(): number {
    return this.state().eyeOffset
  }
  get terrainSupportPaused(): boolean {
    return this.state().terrainSupportPaused
  }
  set terrainSupportPaused(value: boolean) {
    this.forward({ type: 'set', property: 'terrainSupportPaused', value })
  }
  nearestVehicle(): string | null {
    return this.state().nearestVehicle
  }
  vehicleList(): ReturnType<Simulation['vehicleList']> {
    return this.state().vehicleList
  }
  catchDisk(): Transform | null {
    return this.state().catchDisk
  }
  consumeExplosions(): ReturnType<Simulation['consumeExplosions']> {
    return this.explosions.splice(0)
  }
  portalIds(): string[] {
    return Object.keys(this.state().portals)
  }
  portalState(id: string): ReturnType<Simulation['portalState']> {
    const portal = this.state().portals[id]
    if (!portal) throw new Error('Unknown portal')
    return { ...portal }
  }
  entityVelocity(id: string): Vec3Tuple {
    return this.state().velocities[id] ?? [0, 0, 0]
  }
  vehicleInfo(id: string, interpolated = false): ReturnType<Simulation['vehicleInfo']> {
    const reads = this.state().vehicles[id]
    if (!reads) throw vehicleError(id)
    const info = interpolated ? reads.infoInterpolated : reads.info
    if ('error' in info) throw new Error(info.error)
    return info
  }
  wheelContactInfo(id: string): ReturnType<Simulation['wheelContactInfo']> {
    return this.state().vehicles[id]?.wheelContacts ?? []
  }
  vehicleSpec(id: string): ReturnType<Simulation['vehicleSpec']> {
    return this.state().vehicles[id]?.spec ?? null
  }
  vehicleFeedback(id: string): ReturnType<Simulation['vehicleFeedback']> {
    return this.state().vehicles[id]?.feedback ?? null
  }
  vehicleDamage(id: string): ReturnType<Simulation['vehicleDamage']> {
    return this.state().vehicles[id]?.damage ?? { health: 1, destroyed: false }
  }
  cargoCount(id: string): number {
    return this.state().vehicles[id]?.cargoCount ?? 0
  }
  cargoTrailer(id: string): string | null {
    return this.state().vehicles[id]?.cargoTrailer ?? null
  }

  // Instant queries, answered synchronously by the mirrored query world.
  shoot(
    origin: Vec3Tuple,
    direction: Vec3Tuple,
    range = 150,
    impulse = 12,
    excludeEntityId?: string,
  ): ReturnType<Simulation['shoot']> {
    const hit = this.query.shoot(origin, direction, range, excludeEntityId)
    // The impulse is a command: the worker repeats the same shot against the same state.
    if (hit && Number.isFinite(impulse) && impulse > 0)
      this.command('shoot', [origin, direction, range, impulse, excludeEntityId])
    return hit
  }
  cameraPosition(target: Vec3Tuple, desired: Vec3Tuple): Vec3Tuple {
    return this.query.cameraPosition(target, desired)
  }

  /** Scenery poles: the body lives in the worker, the handle here refers to it by number. */
  createSceneryPole(
    position: Vec3Tuple,
    height: number,
    movable: boolean,
  ): ReturnType<Simulation['createSceneryPole']> {
    if (height <= 0 || !Number.isFinite(height) || !position.every(Number.isFinite))
      throw new Error('Invalid scenery pole')
    const pole = this.nextPole++
    let pose = {
      position: [...position] as Vec3Tuple,
      rotation: [0, 0, 0, 1] as Transform['rotation'],
    }
    this.forward({ type: 'pole', pole, op: 'create', args: [position, height, movable] })
    return {
      impact: (point, direction, impulse) =>
        void this.forward({ type: 'pole', pole, op: 'impact', args: [point, direction, impulse] }),
      pose: () => (pose = this.reads?.poles[pole] ?? pose),
      restore: (position, rotation) => {
        pose = { position: [...position], rotation: [...rotation] }
        void this.forward({ type: 'pole', pole, op: 'restore', args: [position, rotation] })
      },
      dispose: () => void this.forward({ type: 'pole', pole, op: 'dispose', args: [] }),
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const waiter of this.waiters.splice(0)) waiter.resolve()
    this.worker.dispose().then(
      () => this.terminate(),
      () => this.terminate(),
    )
    this.query.dispose()
  }
}
