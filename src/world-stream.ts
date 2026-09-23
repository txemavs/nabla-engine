import type { Entity, SceneDocument, Vec3Tuple } from './scene.js'

export const WORLD_TILE_SIZE = 1200
export const worldTileKey = (x: number, z: number) => `${x}_${z}`
export const worldTileAt = (p: Vec3Tuple): [number, number] => [
  Math.floor((p[0] + 600) / 1200),
  Math.floor((p[2] + 600) / 1200),
]
export function tileDistance(key: string, position: Vec3Tuple): number {
  const [x, z] = key.split('_').map(Number)
  return Math.hypot(
    Math.max(0, Math.abs(position[0] - x * 1200) - 600),
    Math.max(0, Math.abs(position[2] - z * 1200) - 600),
  )
}
/** Near terrain first, then a velocity-dependent corridor before the actor arrives. */
export function wantedWorldTiles(
  position: Vec3Tuple,
  velocity: Vec3Tuple,
  horizonSeconds = 15,
): string[] {
  const speed = Math.hypot(velocity[0], velocity[2])
  const lead = Math.min(horizonSeconds > 15 ? 12000 : 4800, speed * horizonSeconds),
    scale = speed > 0 ? lead / speed : 0
  const ahead: Vec3Tuple = [
    position[0] + velocity[0] * scale,
    position[1],
    position[2] + velocity[2] * scale,
  ]
  const [cx, cz] = worldTileAt(position),
    wanted: string[] = []
  const radius = Math.ceil((lead + 700) / WORLD_TILE_SIZE)
  const samples = Array.from({ length: Math.ceil(lead / 600) + 1 }, (_, i) => {
    const fraction = i / Math.max(1, Math.ceil(lead / 600))
    return [
      position[0] + velocity[0] * scale * fraction,
      position[1],
      position[2] + velocity[2] * scale * fraction,
    ] as Vec3Tuple
  })
  for (let x = cx - radius; x <= cx + radius; x++)
    for (let z = cz - radius; z <= cz + radius; z++) {
      const key = worldTileKey(x, z)
      if (
        (Math.abs(x - cx) <= 1 && Math.abs(z - cz) <= 1) ||
        samples.some((p) => tileDistance(key, p) < 700)
      )
        wanted.push(key)
    }
  const priorities = new Map(
    wanted.map((key) => [
      key,
      tileDistance(key, position) * 0.65 + tileDistance(key, ahead) * 0.35,
    ]),
  )
  return wanted.sort((a, b) => priorities.get(a)! - priorities.get(b)!).slice(0, 24)
}
/**
 * Share the install plan. A second evaluation is required only when preparation
 * uses a different horizon: its larger corridor and ranking are not a prefix of
 * the 15-second installation plan, so deriving one from the other changes coverage.
 */
export function planWorldTiles(
  position: Vec3Tuple,
  velocity: Vec3Tuple,
  preparationAhead: number,
  evaluate: typeof wantedWorldTiles = wantedWorldTiles,
): { wanted: string[]; preparing: string[]; prefetch: string[] } {
  const currentKey = worldTileKey(...worldTileAt(position))
  if (position[1] > 12000) return { wanted: [], preparing: [currentKey], prefetch: [] }
  const wanted = evaluate(position, velocity)
  if (preparationAhead === 0) return { wanted, preparing: [currentKey], prefetch: [] }
  const ahead = preparationAhead === 15 ? wanted : evaluate(position, velocity, preparationAhead)
  const preparing = [currentKey, ...ahead.filter((key) => key !== currentKey)].slice(0, 24)
  const installing = new Set(wanted)
  return { wanted, preparing, prefetch: preparing.filter((key) => !installing.has(key)) }
}
/** Exact-input cache: preserves boundary ordering and keeps retries independent of planning. */
export class TilePlanCache {
  private inputs: number[] = []
  private plan?: ReturnType<typeof planWorldTiles>
  constructor(private readonly evaluate: typeof wantedWorldTiles = wantedWorldTiles) {}
  get(position: Vec3Tuple, velocity: Vec3Tuple, horizon: number) {
    const inputs = [...position, ...velocity, horizon]
    if (!this.plan || inputs.some((n, i) => n !== this.inputs[i])) {
      this.inputs = inputs
      this.plan = planWorldTiles(position, velocity, horizon, this.evaluate)
    }
    return this.plan
  }
}
export function mapTileEntities(doc: SceneDocument, key: string): Entity[] {
  const suffix = key === '0_0' ? '' : `-${key}`
  const ids = new Set(
    [
      'world-terrain',
      'world-buildings',
      'world-roads',
      'world-trees',
      'world-landcover',
      'world-water',
      'world-railways',
      'world-places',
    ].map((id) => id + suffix),
  )
  const children = new Map<string, string[]>()
  for (const entity of doc.entities)
    if (entity.parentId) {
      const siblings = children.get(entity.parentId) ?? []
      siblings.push(entity.id)
      children.set(entity.parentId, siblings)
    }
  const queue = [...ids]
  for (let i = 0; i < queue.length; i++)
    for (const child of children.get(queue[i]) ?? [])
      if (!ids.has(child)) {
        ids.add(child)
        queue.push(child)
      }
  return doc.entities.filter((e) => ids.has(e.id))
}
/** Persist a compact fingerprint so saving does not turn generated map data into edits. */
export function mapFingerprint(entities: Entity[]): string {
  const text = JSON.stringify(
    [...entities].sort((a, b) => a.id.localeCompare(b.id)),
    (key, value) => {
      if (key === 'mapBaseline') return undefined
      if (value && typeof value === 'object' && !Array.isArray(value))
        return Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, value[k]]),
        )
      return value
    },
  )
  let a = 2166136261,
    b = 5381
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619)
    b = Math.imul(b, 33) ^ text.charCodeAt(i)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}
export interface WorldStreamHost {
  prepare?(keys: string[]): void
  prefetch?(keys: string[]): void
  document(): SceneDocument
  load(key: string, signal: AbortSignal): Promise<Entity[]>
  replace(remove: Set<string>, add: Entity[]): void
  status(message: string): void
}
/** Keys for the 3×3 neighborhood around position — these should never be cancelled. */
export function immediateNeighborhood(position: Vec3Tuple): Set<string> {
  const [cx, cz] = worldTileAt(position)
  const keys = new Set<string>()
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) keys.add(worldTileKey(cx + dx, cz + dz))
  return keys
}

/** Sort keys by distance to position (nearest first). */
function sortByDistance(keys: Iterable<string>, position: Vec3Tuple): string[] {
  return [...keys].sort((a, b) => tileDistance(a, position) - tileDistance(b, position))
}

/** Load the ground beneath the actor, then the route it will cross before side streets. */
export function prioritizedWorldLoads(
  position: Vec3Tuple,
  velocity: Vec3Tuple,
  wanted: string[],
): string[] {
  const current = worldTileKey(...worldTileAt(position))
  const speed = Math.hypot(velocity[0], velocity[2])
  const lead = speed >= 10 ? Math.min(4800, speed * 15) : 0
  const route = new Set<string>([current])
  const samples = Math.ceil(lead / 600)
  for (let i = 1; i <= samples; i++) {
    const distance = (lead * i) / samples
    const key = worldTileKey(
      ...worldTileAt([
        position[0] + (velocity[0] / speed) * distance,
        position[1],
        position[2] + (velocity[2] / speed) * distance,
      ]),
    )
    if (wanted.includes(key)) route.add(key)
  }
  return [
    ...new Set([...route, ...sortByDistance(immediateNeighborhood(position), position), ...wanted]),
  ]
}

/**
 * Parallel zone streaming with player-zone prioritization.
 * Up to 3 concurrent requests; the player's current zone and immediate neighbors
 * are never cancelled. Edited/saved zones stay pinned; untouched far zones are evicted.
 */
export class WorldStream {
  private readonly resident = new Map<
    string,
    { baseline: string; pinned: boolean; verify?: boolean }
  >()
  private readonly failed = new Map<string, number>()
  private readonly retryCount = new Map<string, number>()
  private wanted: string[] = []
  private position: Vec3Tuple = [0, 0, 0]
  private protectedPositions: Vec3Tuple[] = []
  private readonly inFlight = new Map<string, AbortController>()
  private readonly plans = new TilePlanCache()
  private lastStatus?: string
  private reportStatus(message: string): void {
    if (message === this.lastStatus) return
    this.lastStatus = message
    this.host.status(message)
  }
  private maxConcurrent = 3
  private preparationAhead = 45
  private retainLoaded = false
  private retentionArea = ''
  setQuality(concurrent: number, ahead: number, retainLoaded = false): void {
    if (this.retainLoaded !== retainLoaded) {
      this.limited.clear()
      this.retentionArea = ''
    }
    this.retainLoaded = retainLoaded
    this.maxConcurrent = Math.max(1, Math.min(3, Math.round(concurrent)))
    this.preparationAhead = Math.max(0, Math.min(45, ahead))
  }
  private readonly limited = new Map<string, string>()
  private nextSlot = 0
  private disposed = false
  constructor(
    private readonly host: WorldStreamHost,
    private readonly entityBudget = 18000,
  ) {
    const doc = host.document()
    for (const e of doc.entities)
      if (e.terrain && e.id.startsWith('world-terrain')) {
        const key = e.id === 'world-terrain' ? '0_0' : e.id.slice('world-terrain-'.length)
        const entities = mapTileEntities(doc, key)
        this.resident.set(key, {
          baseline: JSON.stringify(entities),
          pinned: !e.mapBaseline || mapFingerprint(entities) !== e.mapBaseline,
          verify: !e.mapBaseline,
        })
      }
  }
  update(
    position: Vec3Tuple,
    velocity: Vec3Tuple,
    protectedPositions: Vec3Tuple[] = [],
    now = Date.now(),
  ): void {
    if (this.disposed) return
    this.position = position
    this.protectedPositions = protectedPositions
    const plan = this.plans.get(position, velocity, this.preparationAhead)
    if (this.preparationAhead > 0) this.host.prepare?.([...plan.preparing])
    this.host.prefetch?.([...plan.prefetch])
    this.wanted = plan.wanted
    if (position[1] > 12000) return
    if (this.retentionArea !== this.budgetArea()) {
      this.retentionArea = this.budgetArea()
      this.evict()
    }
    const neighborhood = immediateNeighborhood(position)
    const neighborsMissing = [...neighborhood].filter(
      (k) => !this.resident.has(k) && !this.inFlight.has(k),
    )
    const currentKey = worldTileKey(...worldTileAt(position))
    if (neighborsMissing.includes(currentKey) && this.inFlight.size >= this.maxConcurrent) {
      const cancellable = [...this.inFlight.entries()].filter(([k]) => !neighborhood.has(k))
      const farthest = cancellable.sort(
        (a, b) => tileDistance(b[0], position) - tileDistance(a[0], position),
      )[0]
      if (farthest) {
        farthest[1].abort()
        this.inFlight.delete(farthest[0])
      }
    }
    const prioritized = prioritizedWorldLoads(position, velocity, this.wanted)
    while (this.inFlight.size < this.maxConcurrent && now >= this.nextSlot) {
      const area = this.budgetArea()
      const key = prioritized.find(
        (k) =>
          !this.resident.has(k) &&
          !this.inFlight.has(k) &&
          now >= (this.failed.get(k) ?? 0) &&
          this.limited.get(k) !== area,
      )
      if (!key) break
      this.startLoad(key, now, neighborhood.has(key))
    }
    this.updateStatus(neighborhood)
  }
  private updateStatus(neighborhood: Set<string>): void {
    const loading = this.inFlight.size
    const pending = this.wanted.filter((k) => !this.resident.has(k) && !this.inFlight.has(k)).length
    const neighborLoading = [...this.inFlight.keys()].filter((k) => neighborhood.has(k)).length
    const neighborPending = [...neighborhood].filter(
      (k) => !this.resident.has(k) && !this.inFlight.has(k),
    ).length
    if (loading === 0 && pending === 0) {
      this.reportStatus(`Mapa conectado · ${this.resident.size} zonas disponibles`)
    } else if (neighborLoading > 0 || neighborPending > 0) {
      const failedNearby = [...neighborhood].filter((k) => this.failed.has(k)).length
      if (failedNearby > 0) {
        this.reportStatus(
          `Cargando terreno cercano · ${failedNearby} zona(s) pendiente(s) de reintento`,
        )
      } else {
        this.reportStatus(
          `Cargando terreno cercano · ${neighborLoading + neighborPending} zona(s) inmediata(s)`,
        )
      }
    } else if (loading > 0) {
      this.reportStatus(
        `Anticipando recorrido · ${loading} zona(s) cargando, ${pending} pendientes`,
      )
    }
  }
  private startLoad(key: string, _now: number, isNeighbor = false): void {
    const controller = new AbortController()
    this.inFlight.set(key, controller)
    void this.host
      .load(key, controller.signal)
      .then(async (entities) => {
        if (this.disposed || controller.signal.aborted || !this.wanted.includes(key)) return
        let remove = this.makeRoom(key, entities)
        if (!remove) {
          for (const [candidate, state] of this.resident) {
            if (
              !state.verify ||
              this.protectedPositions.some((p) => tileDistance(candidate, p) < 200)
            )
              continue
            if (tileDistance(candidate, this.position) <= tileDistance(key, this.position)) continue
            this.reportStatus(`Vaciando caché de escena · comprobando zona ${candidate}…`)
            try {
              const original = await this.host.load(candidate, controller.signal)
              if (this.disposed || controller.signal.aborted || !this.wanted.includes(key)) return
              state.pinned =
                mapFingerprint(original) !==
                mapFingerprint(mapTileEntities(this.host.document(), candidate))
              state.verify = false
            } catch {
              if (this.disposed || controller.signal.aborted) return
              continue
            }
            remove = this.makeRoom(key, entities)
            if (remove) break
          }
        }
        if (!remove) {
          this.limited.set(key, this.budgetArea())
          this.reportStatus(
            'Límite de detalle · se priorizarán las zonas cercanas al avanzar; las zonas editadas se conservan',
          )
          return
        }
        const existing = new Set(
          this.host
            .document()
            .entities.filter((e) => !remove.has(e.id))
            .map((e) => e.id),
        )
        const add = entities.filter((e) => !existing.has(e.id))
        this.host.replace(remove, add)
        for (const k of this.resident.keys()) {
          const terrainId = k === '0_0' ? 'world-terrain' : `world-terrain-${k}`
          if (remove.has(terrainId)) {
            this.resident.delete(k)
            this.limited.set(k, this.budgetArea())
          }
        }
        this.resident.set(key, {
          baseline: JSON.stringify(mapTileEntities(this.host.document(), key)),
          pinned: false,
        })
        this.failed.delete(key)
        this.retryCount.delete(key)
        this.evict()
      })
      .catch((error: unknown) => {
        if (this.disposed || controller.signal.aborted) return
        const retries = (this.retryCount.get(key) ?? 0) + 1
        this.retryCount.set(key, retries)
        const backoff = isNeighbor
          ? Math.min(5000, 1000 * retries)
          : Math.min(60000, 10000 * retries)
        this.failed.set(key, Date.now() + backoff)
        const seconds = Math.round(backoff / 1000)
        this.reportStatus(
          `Zona ${key} pendiente · ${error instanceof Error ? error.message : 'sin conexión'} · reintento en ${seconds} s`,
        )
      })
      .finally(() => {
        if (this.inFlight.get(key) === controller) {
          this.inFlight.delete(key)
        }
        this.nextSlot = Math.max(this.nextSlot, Date.now() + 100)
      })
  }
  private budgetArea(): string {
    return `${Math.floor(this.position[0] / 200)}_${Math.floor(this.position[2] / 200)}`
  }
  /** Make space before parsing/adding a dense tile, including wanted but farther zones. */
  private makeRoom(key: string, incoming: Entity[]): Set<string> | null {
    const doc = this.host.document(),
      remove = new Set<string>()
    // Experimental Ultra keeps all acquired detail inside the local 20 km footprint.
    if (this.retainLoaded && tileDistance(key, this.position) <= 20000) return remove
    const fits = () => {
      const ids = new Set(doc.entities.filter((e) => !remove.has(e.id)).map((e) => e.id))
      for (const e of incoming) ids.add(e.id)
      return ids.size <= this.entityBudget
    }
    if (fits()) return remove
    const candidates = [...this.resident.keys()].sort(
      (a, b) => tileDistance(b, this.position) - tileDistance(a, this.position),
    )
    for (const candidate of candidates) {
      const state = this.resident.get(candidate)!
      if (state.pinned || this.protectedPositions.some((p) => tileDistance(candidate, p) < 200))
        continue
      if (
        this.wanted.includes(candidate) &&
        tileDistance(candidate, this.position) <= tileDistance(key, this.position)
      )
        continue
      const entities = mapTileEntities(doc, candidate)
      if (JSON.stringify(entities) !== state.baseline) {
        state.pinned = true
        continue
      }
      for (const e of entities) remove.add(e.id)
      if (fits()) return remove
    }
    return null
  }
  private evict(): void {
    const candidates = [...this.resident.keys()].sort(
      (a, b) => tileDistance(b, this.position) - tileDistance(a, this.position),
    )
    for (const key of candidates) {
      const state = this.resident.get(key)!
      if (
        state.pinned ||
        (this.retainLoaded && tileDistance(key, this.position) <= 20000) ||
        this.wanted.includes(key) ||
        this.protectedPositions.some((p) => tileDistance(key, p) < 200)
      )
        continue
      if (this.resident.size <= 10 && tileDistance(key, this.position) < 3000) continue
      const entities = mapTileEntities(this.host.document(), key)
      if (JSON.stringify(entities) !== state.baseline) {
        state.pinned = true
        continue
      }
      this.host.replace(new Set(entities.map((e) => e.id)), [])
      this.resident.delete(key)
    }
  }
  dispose(): void {
    this.disposed = true
    for (const controller of this.inFlight.values()) controller.abort()
    this.inFlight.clear()
  }
}
