import { OwnedProvider } from './owned-provider.js'
import { Vector3 } from 'three'
import type { OsmChartRoad } from '../../planet/osm-snapshot.js'
import { t } from '../../i18n/index.js'

export interface NavigationPlace {
  id: string
  text: string
  position: Vector3
}

export type NavigationRoad = OsmChartRoad

const places = new OwnedProvider<() => Iterable<NavigationPlace>>(() => [])
const roads = new OwnedProvider<() => Iterable<NavigationRoad>>(() => [])

export function setNavigationPlaces(value: () => Iterable<NavigationPlace>) {
  places.set(value)
}
export function navigationPlaces(): NavigationPlace[] {
  return Array.from(places.value())
}
export function setNavigationRoads(value: () => Iterable<NavigationRoad>) {
  roads.set(value)
}
export function navigationRoads(): NavigationRoad[] {
  return Array.from(roads.value())
}

/** OSM settlement points are references, not municipal boundary polygons. */
export function nearestLocality(position: readonly number[]): string {
  let nearest: NavigationPlace | undefined,
    distance = 20000
  for (const place of places.value()) {
    const d = Math.hypot(place.position.x - position[0], place.position.z - position[2])
    if (d < distance) {
      distance = d
      nearest = place
    }
  }
  return nearest
    ? distance > 2000
      ? t('place.near', { name: nearest.text })
      : nearest.text
    : t('place.unknown')
}

function segmentDistance(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const length = dx * dx + dz * dz
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length))
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t))
}

function polylineDistance(x: number, z: number, road: NavigationRoad): number {
  let nearest = Infinity
  for (let i = 1; i < road.points.length; i++) {
    const d = segmentDistance(
      x,
      z,
      road.points[i - 1].x,
      road.points[i - 1].z,
      road.points[i].x,
      road.points[i].z,
    )
    if (d < nearest) nearest = d
  }
  return nearest
}

/** Named street under the pose, or undefined when none is close enough. */
export function nearestStreet(
  position: readonly number[],
  extra: readonly NavigationRoad[] = [],
): string | undefined {
  const x = position[0],
    z = position[2]
  let best: { name: string; dist: number; carriageway: boolean } | undefined
  for (const road of [...roads.value(), ...extra]) {
    if (!road.name) continue
    const pad = Math.max(road.width / 2 + 8, 16)
    if (x < road.minX - pad || x > road.maxX + pad || z < road.minZ - pad || z > road.maxZ + pad)
      continue
    const dist = polylineDistance(x, z, road)
    if (dist > pad) continue
    if (
      !best ||
      dist < best.dist - 0.4 ||
      (Math.abs(dist - best.dist) <= 0.4 && road.carriageway && !best.carriageway)
    )
      best = { name: road.name, dist, carriageway: road.carriageway }
  }
  return best?.name
}

/** Street when the OSM/scene road is under the car; city/locality otherwise. */
export function navigationLabel(
  position: readonly number[],
  extra: readonly NavigationRoad[] = [],
): string {
  return nearestStreet(position, extra) ?? nearestLocality(position)
}

export interface NavigationPlaceLookupOptions {
  /** Metres the pose must move since the last answered query before querying again. */
  minMove?: number
  /** Re-query a stationary pose this often (ms) so streamed-in map data still shows up. */
  refreshMs?: number
  /** Minimum gap between queries (ms). */
  intervalMs?: number
  /** Spatial grid cell size for the road index (metres). */
  cellSize?: number
}

interface RoadIndex {
  roads: NavigationRoad[]
  cell: number
  grid: Map<string, NavigationRoad[]>
  /** Roads whose bounds cover too many cells; always tested (bbox reject first). */
  wide: NavigationRoad[]
  /** Source order, so ties resolve exactly like the linear scan. */
  order: Map<NavigationRoad, number>
}

const MAX_ROAD_CELLS = 256

/** Roads bucketed by padded bounds, so a query only touches roads near the pose. */
function buildRoadIndex(roads: NavigationRoad[], cell: number): RoadIndex {
  const grid = new Map<string, NavigationRoad[]>()
  const wide: NavigationRoad[] = []
  const order = new Map<NavigationRoad, number>()
  for (const road of roads) {
    order.set(road, order.size)
    if (!road.name) continue
    const pad = Math.max(road.width / 2 + 8, 16)
    const x0 = Math.floor((road.minX - pad) / cell),
      x1 = Math.floor((road.maxX + pad) / cell)
    const z0 = Math.floor((road.minZ - pad) / cell),
      z1 = Math.floor((road.maxZ + pad) / cell)
    if (!Number.isFinite(x0 + x1 + z0 + z1) || (x1 - x0 + 1) * (z1 - z0 + 1) > MAX_ROAD_CELLS) {
      wide.push(road)
      continue
    }
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const key = `${ix},${iz}`
        const bucket = grid.get(key)
        if (bucket) bucket.push(road)
        else grid.set(key, [road])
      }
  }
  return { roads, cell, grid, wide, order }
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Best named street within its pad of (x, z), same tie rules as {@link nearestStreet}. */
function indexedStreet(index: RoadIndex, x: number, z: number): string | undefined {
  let best: { name: string; dist: number; carriageway: boolean } | undefined
  const test = (road: NavigationRoad) => {
    const pad = Math.max(road.width / 2 + 8, 16)
    if (x < road.minX - pad || x > road.maxX + pad || z < road.minZ - pad || z > road.maxZ + pad)
      return
    const dist = polylineDistance(x, z, road)
    if (dist > pad) return
    if (
      !best ||
      dist < best.dist - 0.4 ||
      (Math.abs(dist - best.dist) <= 0.4 && road.carriageway && !best.carriageway)
    )
      best = { name: road.name!, dist, carriageway: road.carriageway }
  }
  const near = index.grid.get(`${Math.floor(x / index.cell)},${Math.floor(z / index.cell)}`) ?? []
  if (index.wide.length === 0) near.forEach(test)
  else {
    const order = index.order
    ;[...near, ...index.wide].sort((a, b) => order.get(a)! - order.get(b)!).forEach(test)
  }
  return best?.name
}

/**
 * Coalesced HUD lookup. Queries only after the pose moved `minMove` metres (or `refreshMs`
 * elapsed), and resolves streets through a spatial grid instead of scanning every road.
 */
export class NavigationPlaceLookup {
  private pending = false
  private next = 0
  private generation = 0
  private latest: number[] = [0, 0, 0]
  private last: { x: number; z: number; at: number } | undefined
  private index: RoadIndex | undefined
  private readonly minMove: number
  private readonly refreshMs: number
  private readonly intervalMs: number
  private readonly cellSize: number
  constructor(options: NavigationPlaceLookupOptions = {}) {
    this.minMove = options.minMove ?? 25
    this.refreshMs = options.refreshMs ?? 5000
    this.intervalMs = options.intervalMs ?? 500
    this.cellSize = options.cellSize ?? 128
  }
  request(position: readonly number[], apply: (city: string, street: string) => void): void {
    this.latest[0] = position[0]
    this.latest[1] = position[1]
    this.latest[2] = position[2]
    const now = performance.now()
    if (this.pending || now < this.next) return
    const last = this.last
    if (
      last &&
      Math.hypot(position[0] - last.x, position[2] - last.z) < this.minMove &&
      now - last.at < this.refreshMs
    )
      return
    this.pending = true
    const generation = this.generation
    const pose = [...position]
    const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
    void (async () => {
      await yieldTask()
      if (generation !== this.generation) return
      let city = t('place.unknown'),
        distance = 20000
      for (const place of places.value()) {
        const d = Math.hypot(place.position.x - pose[0], place.position.z - pose[2])
        if (d < distance) {
          distance = d
          city = place.text
        }
      }
      const list = Array.from(roads.value())
      if (!this.index || this.index.cell !== this.cellSize || !sameList(this.index.roads, list)) {
        await yieldTask()
        if (generation !== this.generation) return
        this.index = buildRoadIndex(list, this.cellSize)
      }
      const [x, , z] = pose
      const street = indexedStreet(this.index, x, z)
      if (
        generation === this.generation &&
        Math.hypot(this.latest[0] - x, this.latest[2] - z) < 25
      ) {
        this.last = { x, z, at: performance.now() }
        apply(city, street ?? '')
      }
    })()
      .catch(() => {
        /* Keep the last label while map data is replaced. */
      })
      .finally(() => {
        if (generation === this.generation) {
          this.pending = false
          this.next = performance.now() + this.intervalMs
        }
      })
  }
  reset(): void {
    this.generation++
    this.pending = false
    this.next = 0
    this.last = undefined
    this.index = undefined
  }
}

/** Runtime-owned alternative to the legacy global setter. */
export function registerNavigationPlaces(value: () => Iterable<NavigationPlace>): () => void {
  return places.register(value)
}
/** Runtime-owned alternative to the legacy global setter. */
export function registerNavigationRoads(value: () => Iterable<NavigationRoad>): () => void {
  return roads.register(value)
}
