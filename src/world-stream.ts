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
export function wantedWorldTiles(position: Vec3Tuple, velocity: Vec3Tuple): string[] {
  const speed = Math.hypot(velocity[0], velocity[2])
  const lead = Math.min(4800, speed * 15),
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
  return wanted
    .sort(
      (a, b) =>
        tileDistance(a, position) * 0.65 +
        tileDistance(a, ahead) * 0.35 -
        (tileDistance(b, position) * 0.65 + tileDistance(b, ahead) * 0.35),
    )
    .slice(0, 24)
}
export function mapTileEntities(doc: SceneDocument, key: string): Entity[] {
  const suffix = key === '0_0' ? '' : `-${key}`
  const ids = new Set(
    ['world-terrain', 'world-buildings', 'world-roads', 'world-trees'].map((id) => id + suffix),
  )
  let changed = true
  while (changed) {
    changed = false
    for (const e of doc.entities)
      if (e.parentId && ids.has(e.parentId) && !ids.has(e.id)) {
        ids.add(e.id)
        changed = true
      }
  }
  return doc.entities.filter((e) => ids.has(e.id))
}
export interface WorldStreamHost {
  document(): SceneDocument
  load(key: string, signal: AbortSignal): Promise<Entity[]>
  replace(remove: Set<string>, add: Entity[]): void
  status(message: string): void
}
/** One request at a time. Edited/saved zones stay pinned; untouched far zones are evicted. */
export class WorldStream {
  private readonly resident = new Map<string, { baseline: string; pinned: boolean }>()
  private readonly failed = new Map<string, number>()
  private wanted: string[] = []
  private position: Vec3Tuple = [0, 0, 0]
  private protectedPositions: Vec3Tuple[] = []
  private busy: { key: string; controller: AbortController } | null = null
  private readonly limited = new Map<string, string>()
  private nextRequest = 0
  private disposed = false
  constructor(
    private readonly host: WorldStreamHost,
    private readonly entityBudget = 18000,
  ) {
    const doc = host.document()
    for (const e of doc.entities)
      if (e.terrain && e.id.startsWith('world-terrain')) {
        const key = e.id === 'world-terrain' ? '0_0' : e.id.slice('world-terrain-'.length)
        this.resident.set(key, {
          baseline: JSON.stringify(mapTileEntities(doc, key)),
          pinned: true,
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
    // At orbital altitude, keep the cache instead of downloading invisible ground.
    if (position[1] > 12000) {
      this.wanted = []
      return
    }
    this.wanted = wantedWorldTiles(position, velocity)
    if (this.busy && !this.wanted.includes(this.busy.key)) this.busy.controller.abort()
    if (this.busy || now < this.nextRequest) return
    const area = this.budgetArea()
    const key = this.wanted.find(
      (k) =>
        !this.resident.has(k) && now >= (this.failed.get(k) ?? 0) && this.limited.get(k) !== area,
    )
    if (!key) return
    const controller = new AbortController()
    this.busy = { key, controller }
    this.host.status(`Cargando zona ${key} · anticipando el recorrido…`)
    void this.host
      .load(key, controller.signal)
      .then((entities) => {
        if (this.disposed || controller.signal.aborted || !this.wanted.includes(key)) return
        const remove = this.makeRoom(key, entities)
        if (!remove) {
          this.limited.set(key, this.budgetArea())
          this.host.status(
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
        this.evict()
        this.host.status(`Mapa conectado · ${this.resident.size} zonas disponibles`)
      })
      .catch((error: unknown) => {
        if (this.disposed || controller.signal.aborted) return
        this.failed.set(key, Date.now() + 60000)
        this.host.status(
          `Zona ${key} pendiente · ${error instanceof Error ? error.message : 'sin conexión'} · reintento en 60 s`,
        )
      })
      .finally(() => {
        if (this.busy?.controller === controller) this.busy = null
        this.nextRequest = Math.max(this.nextRequest, Date.now() + 250)
      })
  }
  private budgetArea(): string {
    return `${Math.floor(this.position[0] / 200)}_${Math.floor(this.position[2] / 200)}`
  }
  /** Make space before parsing/adding a dense tile, including wanted but farther zones. */
  private makeRoom(key: string, incoming: Entity[]): Set<string> | null {
    const doc = this.host.document(),
      remove = new Set<string>()
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
    this.busy?.controller.abort()
  }
}
