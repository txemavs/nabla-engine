import { ShapeUtils, Vector2, Vector3 } from 'three'
import { geoToLocal, type GeoPoint } from './geography.js'
import {
  createEntity,
  parseScene,
  rotationDegrees,
  type Entity,
  type SceneDocument,
  type Vec3Tuple,
} from './scene.js'
import { createA3, createCarrier } from './presets.js'
import { terrainHeight, type TerrainData } from './terrain.js'
import { validateSolid, type SolidGeometry } from './solid.js'
import { treeSprite } from './vegetation.js'
import { buildingRoof } from './building-roof.js'

export const IRUN_VENTAS: GeoPoint = { latitude: 43.32969, longitude: -1.819606, altitude: 28.253 }
export interface MapFeature {
  id: string
  tags: Record<string, string>
  rings: { role: string; coordinates: [number, number][] }[]
}
export interface WorldExtract {
  name: string
  origin: GeoPoint
  terrain: TerrainData
  features: MapFeature[]
  source: { retrievedAt: string; [key: string]: unknown }
}
const color = (value: string | undefined, fallback: string) =>
  value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
const number = (value: string | undefined, fallback: number) => {
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) && n >= 0 ? n : fallback
}
/** Bounded real-data district. No synthetic replacement for missing streets or heights. */
export function createRealWorld(
  data: WorldExtract,
  options: { offset?: [number, number]; tileId?: string } = {},
): SceneDocument {
  const [ox, oz] = options.offset ?? [0, 0]
  const suffix = options.tileId ? `-${options.tileId}` : ''
  const entities: Entity[] = [],
    t = data.terrain,
    half = ((t.columns - 1) * t.spacing) / 2,
    depth = ((t.rows - 1) * t.spacing) / 2
  const inside = (p: Vec3Tuple, margin = 5) =>
    Math.abs(p[0]) <= half - margin && Math.abs(p[2]) <= depth - margin
  const project = (p: [number, number]): Vec3Tuple =>
    (() => {
      const local = geoToLocal(data.origin, {
        latitude: p[1],
        longitude: p[0],
        altitude: data.origin.altitude,
      })
      return [local[0] - ox, local[1], local[2] - oz] as Vec3Tuple
    })()
  const height = (x: number, z: number) =>
    terrainHeight(t, Math.max(-half, Math.min(half, x)), Math.max(-depth, Math.min(depth, z)))
  const groups = ['world-buildings', 'world-roads', 'world-trees'].map((id) => id + suffix)
  for (const [i, id] of groups.entries())
    entities.push({
      ...createEntity(id, 'group'),
      name: ['Edificios OSM', 'Calles OSM', 'Árboles OSM'][i],
    })
  const terrain = createEntity('world-terrain' + suffix, 'terrain')
  terrain.name = 'Relieve real · Ventas'
  terrain.terrain = structuredClone(t)
  terrain.color = '#7c927b'
  terrain.size = [half * 2, 100, depth * 2]
  entities.push(terrain)
  const source = (f: MapFeature) => ({
    provider: 'openstreetmap' as const,
    id: f.id,
    retrievedAt: data.source.retrievedAt,
    tags: f.tags,
  })
  for (const f of data.features) {
    const tags = f.tags
    if (tags.building === 'no' || tags['building:part'] === 'no') continue
    if (tags.building || tags['building:part']) {
      const rings = f.rings.map((r) => ({ ...r, points: r.coordinates.map(project) }))
      if (!rings.length || rings.some((r) => r.points.length < 4)) continue
      const g: SolidGeometry = { vertices: [], edges: [], faces: [] }
      const all = rings.flatMap((r) => r.points),
        cx = all.reduce((s, p) => s + p[0], 0) / all.length,
        cz = all.reduce((s, p) => s + p[2], 0) / all.length
      if (cx < -half || cx >= half || cz < -depth || cz >= depth) continue
      const base = Math.min(...all.map((p) => height(p[0], p[2])))
      const bottom = number(tags.min_height, number(tags['building:min_level'], 0) * 3)
      const top = Math.max(
        bottom + 1,
        number(
          tags.height,
          number(tags['building:levels'], tags.building === 'industrial' ? 2 : 3) * 3,
        ),
      )
      // Each outer ring may own holes; the fixture keeps complete closed relation members.
      for (const outer of rings.filter((r) => r.role !== 'inner')) {
        const clean = (points: Vec3Tuple[]) => {
          const out = points.map((p) => new Vector2(p[0] - cx, p[2] - cz))
          if (out.length > 1 && out[0].distanceTo(out[out.length - 1]) < 0.001) out.pop()
          return out.filter((p, i) => i === 0 || p.distanceTo(out[i - 1]) > 0.001)
        }
        const contour = clean(outer.points)
        if (contour.length < 3) continue
        if (!ShapeUtils.isClockWise(contour)) contour.reverse()
        const holes = rings
          .filter((r) => r.role === 'inner')
          .map((r) => clean(r.points))
          .filter((r) => r.length >= 3)
        for (const hole of holes) if (ShapeUtils.isClockWise(hole)) hole.reverse()
        const loops = [contour, ...holes],
          flat = loops.flat(),
          start = g.vertices.length,
          n = flat.length
        for (const y of [bottom, top]) for (const p of flat) g.vertices.push([p.x, y, p.y])
        for (const face of ShapeUtils.triangulateShape(contour, holes)) {
          const a = face.map((i) => start + n + i)
          const va = new Vector3(...g.vertices[a[0]]),
            vb = new Vector3(...g.vertices[a[1]]),
            vc = new Vector3(...g.vertices[a[2]])
          if (vb.sub(va).cross(vc.sub(va)).y < 0) a.reverse()
          g.faces.push(a, a.map((i) => i - n).reverse())
        }
        let offset = 0
        for (const loop of loops) {
          for (let i = 0; i < loop.length; i++) {
            const a = start + offset + i,
              b = start + offset + ((i + 1) % loop.length)
            g.faces.push([a, b, b + n, a + n])
            g.edges.push([a, b], [a + n, b + n], [a, a + n])
          }
          offset += loop.length
        }
      }
      if (!g.faces.length || g.vertices.length > 2048) continue
      const e = createEntity('osm-' + f.id.replace('/', '-'), 'solid', [cx, base, cz])
      e.geometry = buildingRoof(g, tags)
      e.name = tags.name ?? `Edificio · ${f.id}`
      e.color = color(tags['building:colour'], '#b9b5a8')
      e.parentId = groups[0]
      e.source = source(f)
      e.size = [
        Math.max(0.01, Math.max(...all.map((p) => p[0])) - Math.min(...all.map((p) => p[0]))),
        top - bottom,
        Math.max(0.01, Math.max(...all.map((p) => p[2])) - Math.min(...all.map((p) => p[2]))),
      ]
      entities.push(e)
    } else if (tags.highway) {
      if (
        ['construction', 'proposed', 'steps'].includes(tags.highway) ||
        tags.bridge === 'yes' ||
        tags.tunnel === 'yes'
      )
        continue
      const foot = ['footway', 'path', 'pedestrian', 'cycleway'].includes(tags.highway),
        width = Math.min(25, Math.max(1, number(tags.width, foot ? 2 : number(tags.lanes, 2) * 3)))
      const paths: Vec3Tuple[][] = []
      for (const ring of f.rings) {
        const points = ring.coordinates.map(project)
        for (let i = 1; i < points.length; i++) {
          const segment = clipRoadSegment(points[i - 1], points[i], half, depth)
          if (segment) paths.push(segment)
        }
      }
      if (paths.length) {
        const e = createEntity('osm-' + f.id.replace('/', '-') + suffix, 'group')
        e.name = tags.name ?? tags.highway
        e.road = { paths, width, terrainId: terrain.id }
        e.color = foot ? '#b2b0a0' : '#525c60'
        e.parentId = groups[1]
        e.source = source(f)
        entities.push(e)
      }
    } else if (tags.natural === 'tree') {
      const p = project(f.rings[0].coordinates[0])
      if (!inside(p)) continue
      p[1] = height(p[0], p[2])
      const e = createEntity('osm-' + f.id.replace('/', '-'), 'group', p)
      e.name = 'Árbol OSM'
      e.sprite = treeSprite(0)
      e.size = [6, 6, 0.1]
      e.parentId = groups[2]
      e.source = source(f)
      entities.push(e)
    }
  }
  entities.find((e) => e.id === groups[1])!.parentId = terrain.id
  for (const e of entities)
    if (!e.parentId) {
      e.transform.position[0] += ox
      e.transform.position[2] += oz
    }
  const car = createA3('car-a', [0, height(0, 0) + 0.85, 0])
  car.transform.rotation = rotationDegrees(0, -1, 0)
  const carrier = createCarrier('carrier', [20, height(20, 0) + 1.5, 0])
  carrier.name = 'Nave · Ventas'
  const spawn = createEntity('spawn', 'spawn', [-2, height(-2, 0) + 0.1, 0])
  entities.push(car, carrier, spawn)
  // Millimetre precision is sufficient locally and keeps editable snapshots compact.
  for (const e of entities) {
    e.transform.position = e.transform.position.map((n) => Math.round(n * 1000) / 1000) as Vec3Tuple
    if (e.road)
      e.road.paths = e.road.paths.map((path) =>
        path.map((p) => p.map((n) => Math.round(n * 1000) / 1000) as Vec3Tuple),
      )
    if (e.geometry)
      e.geometry.vertices = e.geometry.vertices.map(
        (p) => p.map((n) => Math.round(n * 1000) / 1000) as Vec3Tuple,
      )
  }
  // Validate imported buildings after millimetre rounding. A malformed footprint
  // must not prevent the terrain and all other OSM features from loading.
  let omitted = 0
  const usable = entities.filter((e) => {
    e.name = e.name.slice(0, 100)
    if (!e.geometry) return true
    try {
      validateSolid(e.geometry)
      return true
    } catch {
      omitted++
      return false
    }
  })
  if (omitted)
    usable.find((e) => e.id === groups[0])!.name =
      `Edificios OSM · ${omitted} omitidos por geometría inválida`
  return parseScene({
    version: 1,
    name: data.name,
    geography: { ...data.origin, imagery: 'offline' },
    sky: { mode: 'fixed', at: '2026-09-21T12:00:00.000Z' },
    entities: usable,
  })
}

/** Clip centre lines at shared tile edges; the draper clips their full width. */
export function clipRoadSegment(
  a: Vec3Tuple,
  b: Vec3Tuple,
  hx: number,
  hz: number,
): Vec3Tuple[] | null {
  let lo = 0,
    hi = 1
  for (const [axis, half] of [
    [0, hx],
    [2, hz],
  ]) {
    const delta = b[axis] - a[axis]
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(a[axis]) > half) return null
      continue
    }
    const u = (-half - a[axis]) / delta,
      v = (half - a[axis]) / delta
    lo = Math.max(lo, Math.min(u, v))
    hi = Math.min(hi, Math.max(u, v))
    if (hi <= lo) return null
  }
  return [lo, hi].map((f) => a.map((v, i) => v + (b[i] - v) * f) as Vec3Tuple)
}
