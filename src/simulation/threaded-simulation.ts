/**
 * Main-thread stand-in for a {@link Simulation} whose Rapier world and fixed tick run in a Web
 * Worker (`?physicsWorker=1`, off by default).
 *
 * - Commands (`interact`, `setInput`, `addVehicles`, ...) are forwarded to the worker in call order
 *   and applied there before the next step, exactly where inline code would have applied them.
 * - Frames use {@link ThreadedSimulation.advance} (pipelined): the frame never waits; it renders
 *   the last two worker snapshots blended at a render clock just behind the newest one, while the
 *   worker computes the next step. `step()` (awaited) remains for tests and setup.
 * - Reads (`player`, `entityTransform(id, true)`, `wheelTransforms(id, true)`, `vehicleInfo`, ...)
 *   come from the state the worker returns with every step: the same values inline getters give.
 * - Instant queries (`shoot`, `cameraPosition`) run synchronously against a {@link QueryWorld}: a
 *   never-stepped main-thread Rapier world whose colliders are synced from the worker every step.
 *
 * Every Simulation method that returns a value is written out here (tsc enforces it, see
 * {@link UnansweredInWorker}): per-vehicle reads come from the mirrored state, polled answers
 * (`settleGround`, `preparePlanetCollisions`, ...) give the worker's previous reply, HUD-message
 * commands answer '' (the worker's message lands in `lastMessage`), and terrain hot reload runs
 * its swap and actor support in the worker. Command errors surface on the next `step()` instead
 * of throwing at the call site. Reads after a command and before the next step see the state as of
 * the previous step.
 */
import { QueryWorld } from './query-world.js'
import { simulationDefaults } from '../config/simulation.js'
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

type Fn = (...args: never[]) => unknown
type MethodKeys<T> = { [K in keyof T]: T[K] extends Fn ? K : never }[keyof T]
/** Simulation methods whose return type is not void: the caller may use what they answer. */
type ValueMethods = {
  [K in MethodKeys<Simulation>]: [ReturnType<Extract<Simulation[K], Fn>>] extends [void] ? never : K
}[MethodKeys<Simulation>]
/** Simulation getters/fields: answered by this class or by the mirrored {@link SimulationReads}. */
type PropertyKeys = Exclude<keyof Simulation, MethodKeys<Simulation>>
/**
 * The facade forwards any method it does not define as a fire-and-forget command that returns
 * undefined, and reads any property it does not define from {@link SimulationReads}. That is
 * only right for void methods and mirrored reads: every value-returning method must be written
 * out below (answered from the last worker state, main-thread state, or a documented fallback),
 * and every property must be mirrored. Adding one to Simulation without that fails tsc here.
 */
export type UnansweredInWorker =
  | Exclude<ValueMethods, keyof ThreadedSimulation>
  | Exclude<PropertyKeys, keyof ThreadedSimulation | keyof SimulationReads>
const everyValueAnswered: [UnansweredInWorker] extends [never]
  ? true
  : { 'Implement these in ThreadedSimulation': UnansweredInWorker } = true
void everyValueAnswered

/** HUD message of a command answered in the worker (not available synchronously; empty = none). */
const NO_MESSAGE = ''

/** Commands that skip the round trip when called again with the same roads/areas (by identity). */
const IDENTITY_COMMANDS = new Set(['setSurfaceRoads', 'setSurfaceAreas'])

const vehicleError = (id: string) => new Error('Unknown vehicle: ' + id)

/** Commands that add entities: their ids exist here at once, in the worker after its next step. */
const ADDING_COMMANDS = new Set(['addVehicles', 'addPlaced'])
/** Commands that remove entities (by id or ids). */
const REMOVING_COMMANDS = new Set(['removeVehicle', 'removePlaced'])

/** A command that names an entity the worker no longer (or not yet) has: logged and dropped. */
export function isUnknownEntityError(error: unknown): boolean {
  return /^(Unknown (entity|vehicle|portal)|No vehicle)\b/.test(
    String((error as Error)?.message ?? error),
  )
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
  /** Previous worker reply per `method(args)`, for reads that need the worker's own answer. */
  private readonly lagged = new Map<string, unknown>()
  private readonly laggedInFlight = new Set<string>()
  private nextSupport = 1
  /** Planet collision tiles the worker holds, by id (the object sent), and the last id list. */
  private sentTiles = new Map<string, object>()
  private lastTileIds = ''
  /**
   * HUD messages that forwarded commands answer in the worker (the call itself answers ''):
   * the runtime routes them to its own `onMessage` once the worker replies.
   */
  onMessage: ((message: string) => void) | null = null
  private gravityMultiplier: number = simulationDefaults.gravityScaleRange.default
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
    // Adding/removing entities asks for the full state back at once, so the mirror (poses,
    // portals, vehicles) knows the new ids without waiting for a step: during the intro no
    // steps run, and the view, monitors and portals read the new ids right away.
    const structural = ADDING_COMMANDS.has(method) || REMOVING_COMMANDS.has(method)
    void this.forward({ type: 'call', method, args, quiet: !structural })
    return undefined
  }

  /** Forward a command whose answer is a HUD message; answered now with {@link NO_MESSAGE}. */
  private message(method: string, args: unknown[], orElse?: string): string {
    if (this.disposed) return NO_MESSAGE
    this.forward({ type: 'call', method, args, orElse }).then(
      (value) => {
        if (typeof value === 'string' && value && !this.disposed) this.onMessage?.(value)
      },
      () => {},
    )
    return NO_MESSAGE
  }
  /** Forward and answer with the worker's previous reply for the same call (`initial` before). */
  private laggedCall<T>(method: string, args: unknown[], initial: T): T {
    const key = method + JSON.stringify(args)
    if (!this.disposed && !this.laggedInFlight.has(key)) {
      this.laggedInFlight.add(key)
      this.forward({ type: 'call', method, args, quiet: true })
        .then(
          (value) => this.lagged.set(key, value),
          () => {},
        )
        .finally(() => this.laggedInFlight.delete(key))
    }
    return this.lagged.has(key) ? (this.lagged.get(key) as T) : initial
  }
  private vehicleReads(id: string | null | undefined) {
    return id ? this.reads?.vehicles[id] : undefined
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
    this.workerStepMs = await this.worker.step(elapsed)
    this.throwFailure()
  }

  /** Cost of the worker's latest step, ms (its own thread; for ?performanceLog=1). */
  workerStepMs = 0
  /** Frame time not yet sent to the worker (a step is in flight). */
  private unsent = 0
  private inFlight = false
  /**
   * Pipelined frame step: never waits. Moves the render clock by `elapsed` (interpolated reads
   * blend the last two worker snapshots there) and hands the worker the time to simulate: at
   * once when it is idle, else accumulated and sent the moment its current step replies. The
   * worker computes the next step while this thread renders. Inputs and commands sent before
   * reach the worker first, in order.
   */
  advance(elapsed: number): void {
    this.throwFailure()
    if (this.disposed) return
    this.worker.pipelined = true
    this.worker.clock.advance(elapsed)
    this.unsent += elapsed
    this.pump()
  }
  private pump(): void {
    if (this.inFlight || this.disposed || this.unsent <= 0) return
    const elapsed = this.unsent
    this.unsent = 0
    this.inFlight = true
    this.worker.step(elapsed).then(
      (ms) => {
        this.workerStepMs = ms
        this.inFlight = false
        this.pump()
      },
      (error: unknown) => {
        this.inFlight = false
        this.failure ??= error
      },
    )
  }
  // Lagged worker answers: polled until they change (reveal ground hold, planet collisions).
  settleGround(force = false): boolean {
    return this.laggedCall('settleGround', [force], false)
  }
  preparePlanetCollisions(): boolean {
    return this.laggedCall('preparePlanetCollisions', [], false)
  }
  vehicleSunOccluded(id: string, direction: Vec3Tuple, range = 200): boolean {
    // Keyed by vehicle only: the sun direction changes slowly and is re-asked every frame.
    void direction
    void range
    return this.laggedCall('vehicleSunOccluded', [id], false)
  }
  entityCollisionParts(id: string): ReturnType<Simulation['entityCollisionParts']> {
    return this.laggedCall('entityCollisionParts', [id], [])
  }

  // Per-vehicle reads mirrored with every worker state.
  engineMode(id: string): ReturnType<Simulation['engineMode']> {
    return this.vehicleReads(id)?.engineMode ?? 'normal'
  }
  twoWheeledPose(id: string): ReturnType<Simulation['twoWheeledPose']> {
    return this.vehicleReads(id)?.twoWheeledPose ?? null
  }
  forkliftPose(id: string): ReturnType<Simulation['forkliftPose']> {
    return this.vehicleReads(id)?.forkliftPose ?? null
  }
  wheelVisualState(id: string): ReturnType<Simulation['wheelVisualState']> {
    return this.vehicleReads(id)?.wheelVisualState ?? null
  }
  entityAngularVelocity(id: string): Vec3Tuple {
    return this.vehicleReads(id)?.angularVelocity ?? [0, 0, 0]
  }
  hitchCandidate(tractorId = this.player.vehicleId): string | null {
    return this.vehicleReads(tractorId)?.hitchCandidate ?? null
  }
  dockingCandidate(id = this.player.vehicleId): string | null {
    return this.vehicleReads(id)?.dockingCandidate ?? null
  }
  sceneryActors(): Vec3Tuple[] {
    return this.reads?.sceneryActors ?? []
  }

  // Commands answering a HUD message: applied in the worker, the message is not synchronous.
  interact(...args: Parameters<Simulation['interact']>): string {
    return this.message('interact', args)
  }
  toggleFlight(): string {
    return this.message('toggleFlight', [])
  }
  toggleDock(): string {
    return this.message('toggleDock', [])
  }
  /**
   * Null (nothing to hitch) only on foot, as inline. Seated, the worker tries the hitch and falls
   * back to `toggleDock` itself, so `toggleHitch() ?? toggleDock()` never runs both.
   */
  toggleHitch(): string | null {
    if (!this.player.vehicleId) return null
    return this.message('toggleHitch', [], 'toggleDock')
  }
  cycleHelmMode(): string {
    return this.message('cycleHelmMode', [])
  }
  setHelmMode(...args: Parameters<Simulation['setHelmMode']>): string {
    return this.message('setHelmMode', args)
  }
  automaticTransmission(): string {
    return this.message('automaticTransmission', [])
  }
  shiftVehicle(direction: -1 | 1): string {
    return this.message('shiftVehicle', [direction])
  }
  transferControls(): string {
    return this.message('transferControls', [])
  }
  recoverVehicle(...args: Parameters<Simulation['recoverVehicle']>): string {
    return this.message('recoverVehicle', args)
  }
  relocateVehicle(...args: Parameters<Simulation['relocateVehicle']>): string {
    return this.message('relocateVehicle', args)
  }
  setEngineMode(...args: Parameters<Simulation['setEngineMode']>): string {
    return this.message('setEngineMode', args)
  }
  setGarageDoor(...args: Parameters<Simulation['setGarageDoor']>): string {
    return this.message('setGarageDoor', args)
  }
  setTrailerPlatform(...args: Parameters<Simulation['setTrailerPlatform']>): string {
    return this.message('setTrailerPlatform', args)
  }
  adjustTrailerRamp(...args: Parameters<Simulation['adjustTrailerRamp']>): string {
    return this.message('adjustTrailerRamp', args)
  }
  hitchTrailer(...args: Parameters<Simulation['hitchTrailer']>): string {
    return this.message('hitchTrailer', args)
  }
  configurePortal(...args: Parameters<Simulation['configurePortal']>): string {
    return this.message('configurePortal', args)
  }
  /** Ids released in the worker are not known yet: answers the trailers it is about to drop. */
  unhitchTrailer(trailerId?: string): string[] {
    this.command('unhitchTrailer', [trailerId])
    return trailerId ? [trailerId] : []
  }

  // Commands whose boolean only says the call applied: true when the entity is known here.
  liftNearbyBike(): boolean {
    this.command('liftNearbyBike', [])
    // A lift under way answers true inline. A new one is predicted from the mirrored pose of the
    // bike inline would pick (ridden, ejected from, or nearest): fallen or crashed and stopped.
    // The worker still decides (reach, walls); this only keeps the press from also jumping.
    if (this.reads?.playerBikeRecovery) return true
    const id =
      this.player.vehicleId ?? this.reads?.playerEjection?.vehicleId ?? this.reads?.nearestVehicle
    const pose = this.twoWheeledPose(id ?? '')
    return !!pose && (pose.fallen || pose.crashed) && Math.abs(pose.roadSpeed) < 1.5
  }
  holdEngine(): boolean {
    this.command('holdEngine', [])
    return true
  }
  startEngine(): boolean {
    this.command('startEngine', [])
    return true
  }
  setEntityKinematic(...args: Parameters<Simulation['setEntityKinematic']>): boolean {
    this.command('setEntityKinematic', args)
    return this.hasEntity(args[0])
  }
  setWheelVisualState(...args: Parameters<Simulation['setWheelVisualState']>): boolean {
    this.command('setWheelVisualState', args)
    return this.hasEntity(args[0])
  }
  moveKinematicEntity(...args: Parameters<Simulation['moveKinematicEntity']>): boolean {
    this.command('moveKinematicEntity', args)
    return this.hasEntity(args[0])
  }
  setFlightSpeedMode(...args: Parameters<Simulation['setFlightSpeedMode']>): boolean {
    this.command('setFlightSpeedMode', args)
    return this.hasEntity(args[0])
  }

  /**
   * Called every frame with the resident collision tiles (megabytes of triangles). Only tiles
   * the worker has not been sent cross the thread; an unchanged list sends nothing at all.
   */
  setPlanetTiles(...[tiles]: Parameters<Simulation['setPlanetTiles']>): void {
    if (this.disposed) return
    const ids = tiles.map((tile) => tile.id)
    const added = tiles.filter((tile) => this.sentTiles.get(tile.id) !== tile)
    const key = ids.join('|')
    if (!added.length && key === this.lastTileIds) return
    this.lastTileIds = key
    const next = new Map<string, object>()
    for (const tile of tiles) next.set(tile.id, tile)
    this.sentTiles = next
    void this.forward({ type: 'tiles', ids, added })
  }

  // Terrain hot reload: the collision swap and actor support run in the worker.
  /** Undefined until the worker has prepared this replacement (the caller polls per frame). */
  preparePlanetReplacement(
    ...[previousId, tile]: Parameters<Simulation['preparePlanetReplacement']>
  ): ReturnType<Simulation['preparePlanetReplacement']> {
    const key = 'planet:' + previousId + '>' + (tile as { id?: string }).id
    if (this.lagged.get(key) === true) {
      this.lagged.delete(key)
      return () => void this.forward({ type: 'planet', op: 'commit' })
    }
    if (!this.disposed && !this.laggedInFlight.has(key)) {
      this.laggedInFlight.add(key)
      this.forward({ type: 'planet', op: 'prepare', previousId, tile })
        .then(
          (ready) => this.lagged.set(key, ready),
          () => {},
        )
        .finally(() => this.laggedInFlight.delete(key))
    }
    return undefined
  }
  /** Samples the render ground under each actor here; the worker keeps them on it. */
  capturePlanetSupport(sample: (position: Vec3Tuple) => number | undefined): () => void {
    const positions: Vec3Tuple[] = [this.player.position]
    for (const { id } of this.reads?.vehicleList ?? [])
      if (this.worker.snapshotOrNull?.entities[id])
        positions.push(this.worker.entityTransform(id).position)
    const heights: number[][] = []
    for (const p of positions) {
      const ground = sample(p)
      if (ground !== undefined) heights.push([p[0], p[1], p[2], ground])
    }
    const token = this.nextSupport++
    void this.forward({ type: 'support', op: 'capture', token, heights })
    return () => void this.forward({ type: 'support', op: 'restore', token })
  }

  // Inline-only: the main-thread query world is fed by worker deltas, not by these.
  queryState(): ReturnType<Simulation['queryState']> {
    throw new Error('queryState is inline-only (the worker exports QueryWorld deltas)')
  }
  queryExclusions(): ReturnType<Simulation['queryExclusions']> {
    throw new Error('queryExclusions is inline-only (the worker exports QueryWorld deltas)')
  }

  /** Clamped here (same rule as Simulation) so callers get the value used without a round trip. */
  setGravityScale(scale: number): number {
    const { min, max, default: fallback } = simulationDefaults.gravityScaleRange
    this.gravityMultiplier = Number.isFinite(scale) ? Math.min(max, Math.max(min, scale)) : fallback
    this.command('setGravityScale', [this.gravityMultiplier])
    return this.gravityMultiplier
  }
  get gravityScale(): number {
    return this.gravityMultiplier
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
    const ids = Object.keys(this.state().portals)
    for (const [id, entity] of this.pending) if (entity.portal && !ids.includes(id)) ids.push(id)
    return ids
  }
  portalState(id: string): ReturnType<Simulation['portalState']> {
    // A mouth added this frame is known here before the worker's reply: it joins as authored.
    const portal = this.state().portals[id] ?? this.pending.get(id)?.portal
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
