import * as THREE from 'three'
import { sceneryPhysicsDefaults } from '../config/scenery-physics.js'
import type { ImpactSurface } from '../config/impact-sounds.js'
import type { Simulation } from '../simulation/simulation.js'

type Vec3 = [number, number, number]
type Quat = [number, number, number, number]
type SceneryBodies = Pick<Simulation, 'createSceneryPole' | 'renderPlayerPosition'> &
  Partial<Pick<Simulation, 'sceneryActors'>>
type PoleHandle = ReturnType<Simulation['createSceneryPole']>
type Pose = { position: Vec3; rotation: Quat }

const clampRadius = (value: number): number =>
  Math.max(
    sceneryPhysicsDefaults.radiusMin,
    Math.min(sceneryPhysicsDefaults.radiusMax, Math.round(value)),
  )

/** Legacy host storage that held the physics radius before it became an engine setting. */
const legacyStorageKey = 'euskadi.irun-signs'

function initialSettings(): { enabled: boolean; radius: number } {
  // Hosts used to publish these two values as data attributes; honour them if present.
  const data = typeof document === 'undefined' ? undefined : document.documentElement.dataset
  let radius = Number(data?.signPhysicsRadius)
  if (!Number.isFinite(radius) || !data?.signPhysicsRadius) {
    try {
      radius = Number(
        JSON.parse(globalThis.localStorage?.getItem(legacyStorageKey) ?? '{}')?.physicsRadius,
      )
    } catch {
      radius = NaN
    }
  }
  return {
    enabled: data?.signPhysics ? data.signPhysics === 'true' : sceneryPhysicsDefaults.enabled,
    radius: Number.isFinite(radius) ? clampRadius(radius) : sceneryPhysicsDefaults.radius,
  }
}

/** Options of one scenery layer. */
export interface SceneryLayerOptions {
  /** Knockable (signs) or fixed (traffic lights). Fixed layers never remember fallen poses. */
  movable: boolean
  /** Most live bodies in this layer. Defaults to `sceneryPhysicsDefaults.maxBodies`; may be `Infinity`. */
  maxBodies?: number
  /**
   * World scenery that is always solid (trees, lamp posts): bodies within `reach` metres of **any**
   * actor (the player and every vehicle), whatever the shared radius and on/off switch say, and at
   * most `budgetMs` of body creation per refresh (nearest first when the host feeds them so).
   * Without it the layer follows the shared settings and the player only, like signs.
   */
  world?: { reach: number; budgetMs: number }
  /**
   * What a shot hears when it hits one of this layer's bodies (`config/impact-sounds.ts`).
   * Defaults to `sceneryPhysicsDefaults.surface` for signs and traffic lights; world layers
   * (trees, lamp posts) are silent unless they set it. `null` is silent.
   */
  surface?: ImpactSurface | null
}

interface LayerConfig {
  movable: boolean
  maxBodies: number
  world: { reach: number; budgetMs: number } | null
  surface: ImpactSurface | null
}

const identity = new THREE.Matrix4()

/**
 * The one scenery-physics service of a runtime. Hosts register a *layer* per kind of scenery
 * and feed it the poles currently wanted around the player; the service decides, from the shared
 * settings (`enabled`, `radius`), which of them get a body, keeps knocked-down poses while a
 * region streams out and hands the current pose back for rendering.
 *
 * It owns physics only. Light budgets (`Streetlights`) and meshes stay with their renderers.
 */
export class SceneryPhysics {
  private on: boolean
  private reach: number
  private readonly layers = new Set<SceneryLayer>()

  constructor(private readonly simulation: () => SceneryBodies | null | undefined) {
    const initial = initialSettings()
    this.on = initial.enabled
    this.reach = initial.radius
  }

  /** Scenery responds to impacts and gets bodies near the player. */
  get enabled(): boolean {
    return this.on
  }
  /** Metres around the player inside which scenery gets a body. */
  get radius(): number {
    return this.reach
  }

  /** Turn scenery physics on or off; layers retire their bodies on their next `begin()`. */
  setEnabled(enabled: boolean): void {
    this.on = enabled
    this.publish()
  }
  /** Set the physics radius in metres, clamped to the editable range. */
  setRadius(metres: number): void {
    if (!Number.isFinite(metres)) return
    this.reach = clampRadius(metres)
    this.publish()
  }

  /** Create a layer for one kind of scenery. */
  layer(name: string, options: SceneryLayerOptions): SceneryLayer {
    const layer = new SceneryLayer(this, name, {
      movable: options.movable,
      maxBodies: options.maxBodies ?? sceneryPhysicsDefaults.maxBodies,
      world: options.world ?? null,
      surface:
        options.surface !== undefined
          ? options.surface
          : options.world
            ? null
            : sceneryPhysicsDefaults.surface,
    })
    this.layers.add(layer)
    return layer
  }

  /** Live and remembered poles per layer. */
  diagnostics(): { name: string; movable: boolean; active: number; fallen: number }[] {
    return [...this.layers].map((layer) => layer.stats())
  }

  /** Release every layer's bodies. */
  dispose(): void {
    for (const layer of [...this.layers]) layer.dispose()
  }

  /** @internal Bodies of the current simulation, if it is running. */
  bodies(): SceneryBodies | null | undefined {
    return this.simulation()
  }
  /** @internal Called by a layer when it is disposed. */
  forget(layer: SceneryLayer): void {
    this.layers.delete(layer)
  }

  /** Mirror the settings to the data attributes older host code still reads. */
  private publish(): void {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.signPhysics = String(this.on)
    document.documentElement.dataset.signPhysicsRadius = String(this.reach)
  }
}

/** One kind of scenery (for example sign posts) inside `SceneryPhysics`. */
export class SceneryLayer {
  private readonly active = new Map<string, { handle: PoleHandle; base: THREE.Matrix4 }>()
  private readonly fallen = new Map<string, { pose: Pose; base: THREE.Matrix4 }>()
  private readonly wanted = new Set<string>()
  private readonly matrix = new THREE.Matrix4()
  private created = 0
  private deferred = 0
  private deadline = 0

  constructor(
    private readonly owner: SceneryPhysics,
    readonly name: string,
    private readonly options: LayerConfig,
  ) {}

  /** Start a refresh: poles not re-added before `end()` are retired. */
  begin(): void {
    this.wanted.clear()
    this.created = 0
    this.deferred = 0
    this.deadline = performance.now() + (this.options.world?.budgetMs ?? 0)
    if (!this.options.world && !this.owner.enabled) this.end()
  }

  /** True while the simulation these bodies belong to is running. */
  get available(): boolean {
    return !!this.owner.bodies()
  }
  /** Poles of the last refresh that are wanted but not built yet (creation budget). */
  get pending(): number {
    return this.deferred
  }
  /** Positions of the player and every vehicle, as the simulation reports them. */
  actors(): Vec3[] {
    const simulation = this.owner.bodies()
    return (
      simulation?.sceneryActors?.() ??
      (simulation?.renderPlayerPosition ? [simulation.renderPlayerPosition] : [])
    )
  }

  /**
   * Ask for a body for the pole `key` standing on `ground` at (`x`, `z`). Ignored when physics is
   * off, the pole is outside the radius, or the layer is full.
   */
  add(key: string, x: number, ground: number, z: number, height: number, halfWidth?: number): void {
    const world = this.options.world
    if (!world && !this.owner.enabled) return
    const simulation = this.owner.bodies()
    const center: Vec3 = [x, ground + height / 2, z]
    if (world) {
      if (!simulation || !this.within(center, height / 2, halfWidth ?? 0.09, world.reach)) return
    } else {
      const at = simulation?.renderPlayerPosition
      if (!simulation || !at || Math.hypot(x - at[0], z - at[2]) > this.owner.radius) return
    }
    this.wanted.add(key)
    if (this.active.has(key) || this.active.size >= this.options.maxBodies) return
    if (world && this.created > 0 && performance.now() >= this.deadline) {
      this.deferred++
      return
    }
    this.created++
    const handle = world
      ? simulation!.createSceneryPole(center, height, this.options.movable, {
          half: [halfWidth ?? 0.09, height / 2, halfWidth ?? 0.09],
          solid: true,
          ...(this.options.surface ? { surface: this.options.surface } : {}),
        })
      : simulation!.createSceneryPole(
          center,
          height,
          this.options.movable,
          this.options.surface ? { surface: this.options.surface } : undefined,
        )
    const saved = this.fallen.get(key)
    const base =
      saved?.base ?? (world ? identity : new THREE.Matrix4().makeTranslation(-x, -center[1], -z))
    if (saved) handle.restore(saved.pose.position, saved.pose.rotation)
    this.active.set(key, { handle, base })
  }

  /** Distance from the box of a pole to the nearest actor is below `reach` (3D, like the trimesh set). */
  private within(center: Vec3, halfHeight: number, halfWidth: number, reach: number): boolean {
    return this.actors().some(
      (a) =>
        Math.hypot(
          Math.max(center[0] - halfWidth - a[0], 0, a[0] - (center[0] + halfWidth)),
          Math.max(center[1] - halfHeight - a[1], 0, a[1] - (center[1] + halfHeight)),
          Math.max(center[2] - halfWidth - a[2], 0, a[2] - (center[2] + halfWidth)),
        ) < reach,
    )
  }

  /** Finish a refresh: retire poles that were not wanted, remembering knocked-down ones. */
  end(): void {
    for (const [key, item] of this.active)
      if (!this.wanted.has(key)) {
        if (this.options.movable)
          this.fallen.set(key, { pose: item.handle.pose(), base: item.base })
        item.handle.dispose()
        this.active.delete(key)
      }
  }

  /** Push the live pole `key` (a shot or a hit). No effect on fixed layers or retired poles. */
  impact(key: string, point: Vec3, direction: Vec3, impulse: number): void {
    this.active.get(key)?.handle.impact(point, direction, impulse)
  }

  /** Premultiply `matrix` (the pole's rest transform) by its current physical pose. */
  transform(key: string, matrix: THREE.Matrix4): void {
    const active = this.active.get(key)
    const saved = this.fallen.get(key)
    const pose = active?.handle.pose() ?? saved?.pose
    const base = active?.base ?? saved?.base
    if (!pose || !base) return
    this.matrix
      .compose(
        new THREE.Vector3(...pose.position),
        new THREE.Quaternion(...pose.rotation),
        new THREE.Vector3(1, 1, 1),
      )
      .multiply(base)
    matrix.premultiply(this.matrix)
  }

  /** @internal Counts for `SceneryPhysics.diagnostics`. */
  stats(): { name: string; movable: boolean; active: number; fallen: number } {
    return {
      name: this.name,
      movable: this.options.movable,
      active: this.active.size,
      fallen: this.fallen.size,
    }
  }

  /** Release every body and forget fallen poses. */
  dispose(): void {
    for (const item of this.active.values()) item.handle.dispose()
    this.active.clear()
    this.fallen.clear()
    this.owner.forget(this)
  }
}
