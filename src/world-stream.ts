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
  const lead = Math.min(1600, speed * 15),
    scale = speed > 0 ? lead / speed : 0
  const ahead: Vec3Tuple = [
    position[0] + velocity[0] * scale,
    position[1],
    position[2] + velocity[2] * scale,
  ]
  const [cx, cz] = worldTileAt(position),
    wanted: string[] = []
  for (let x = cx - 2; x <= cx + 2; x++)
    for (let z = cz - 2; z <= cz + 2; z++) {
      const key = worldTileKey(x, z)
      if (tileDistance(key, position) < 700 || tileDistance(key, ahead) < 700) wanted.push(key)
    }
  return wanted
    .sort(
      (a, b) =>
        tileDistance(a, position) * 0.65 +
        tileDistance(a, ahead) * 0.35 -
        (tileDistance(b, position) * 0.65 + tileDistance(b, ahead) * 0.35),
    )
    .slice(0, 12)
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
  private busy: AbortController | null = null
  private nextRequest = 0
  private disposed = false
  constructor(private readonly host: WorldStreamHost) {
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
    if (this.busy || now < this.nextRequest) return
    const key = this.wanted.find((k) => !this.resident.has(k) && now >= (this.failed.get(k) ?? 0))
    if (!key) return
    const controller = new AbortController()
    this.busy = controller
    this.host.status(`Cargando zona ${key} · anticipando el recorrido…`)
    void this.host
      .load(key, controller.signal)
      .then((entities) => {
        if (this.disposed || controller.signal.aborted || !this.wanted.includes(key)) return
        const existing = new Set(this.host.document().entities.map((e) => e.id))
        const add = entities.filter((e) => !existing.has(e.id))
        this.host.replace(new Set(), add)
        this.resident.set(key, {
          baseline: JSON.stringify(mapTileEntities(this.host.document(), key)),
          pinned: false,
        })
        this.failed.delete(key)
        this.evict()
        this.host.status(`Mapa conectado · ${this.resident.size} zonas disponibles`)
      })
      .catch((error: unknown) => {
        if (this.disposed) return
        this.failed.set(key, Date.now() + 60000)
        this.nextRequest = Date.now() + 60000
        this.host.status(
          `Zona ${key} pendiente · ${error instanceof Error ? error.message : 'sin conexión'} · reintento en 60 s`,
        )
      })
      .finally(() => {
        if (this.busy === controller) this.busy = null
        this.nextRequest = Math.max(this.nextRequest, Date.now() + 8000)
      })
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
    this.busy?.abort()
  }
}
