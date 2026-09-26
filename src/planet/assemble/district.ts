/**
 * Shared state while a downloaded district becomes a scene.
 *
 * One heightfield, one projection, and the groups that later emitters parent into.
 * Emitters append entities; they do not reproject the district.
 */
import type { MapFeature, WorldExtract } from '../extract/contract.js'
import { compactMapTags } from '../extract/tags.js'
import { geoToLocal } from '../../math/geo/sphere.js'
import type { Vec3Tuple } from '../../math/frame/vectors.js'
import { createEntity, type Entity } from '../../entity/schema.js'
import { terrainHeight } from '../land/terrain.js'
import type { SolidGeometry } from '../../math/solid/mesh.js'
import { buildingFootprints } from '../buildings/buildings.js'
import { isWaterFeature } from '../land/surface.js'
import { pointInPolygon } from '../../math/planar/polygon.js'
import { SURFACE_COLORS } from '../land/surface.js'

export interface DistrictOptions {
  offset?: [number, number]
  tileId?: string
  project?: (point: [number, number]) => Vec3Tuple
  preservePrecision?: boolean
  halfOpenOwnership?: boolean
  experimentalLargeScene?: boolean
}

export function metric(value: string | undefined, fallback: number) {
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export interface District {
  data: WorldExtract
  options: DistrictOptions
  entities: Entity[]
  terrain: Entity
  /** buildings, roads, trees, landcover, water, railways, places */
  groups: string[]
  suffix: string
  half: number
  depth: number
  project: (point: [number, number]) => Vec3Tuple
  height: (x: number, z: number) => number
  inside: (p: Vec3Tuple, margin?: number) => boolean
  source: (f: MapFeature) => NonNullable<Entity['source']>
  footprints: ReturnType<typeof buildingFootprints>
  coveredByWater: (p: [number, number]) => boolean
  addSurface: (
    f: MapFeature,
    geometry: SolidGeometry,
    part: string,
    color: string,
    parentId: string,
  ) => void
}

export function openDistrict(data: WorldExtract, options: DistrictOptions = {}): District {
  const [ox, oz] = options.offset ?? [0, 0]
  const suffix = options.tileId && options.tileId !== '0_0' ? `-${options.tileId}` : ''
  const entities: Entity[] = []
  const t = data.terrain
  const half = ((t.columns - 1) * t.spacing) / 2
  const depth = ((t.rows - 1) * t.spacing) / 2
  const inside = (p: Vec3Tuple, margin = 5) =>
    options.halfOpenOwnership
      ? p[0] >= -half && p[0] < half && p[2] >= -depth && p[2] < depth
      : Math.abs(p[0]) <= half - margin && Math.abs(p[2]) <= depth - margin
  const project =
    options.project ??
    ((p: [number, number]): Vec3Tuple => {
      const local = geoToLocal(data.origin, {
        latitude: p[1],
        longitude: p[0],
        altitude: data.origin.altitude,
      })
      return [local[0] - ox, local[1], local[2] - oz]
    })
  const height = (x: number, z: number) =>
    terrainHeight(t, Math.max(-half, Math.min(half, x)), Math.max(-depth, Math.min(depth, z)))
  const groups = [
    'world-buildings',
    'world-roads',
    'world-trees',
    'world-landcover',
    'world-water',
    'world-railways',
    'world-places',
  ].map((id) => id + suffix)
  const names = [
    'Edificios OSM',
    'Calles OSM',
    'Árboles OSM',
    'Terreno OSM',
    'Agua OSM',
    'Vías OSM',
    'Poblaciones OSM',
  ]
  for (const [i, id] of groups.entries())
    entities.push({ ...createEntity(id, 'group'), name: names[i] })
  const terrain = createEntity('world-terrain' + suffix, 'terrain')
  terrain.name = `Relieve real · ${data.name}`
  terrain.terrain = structuredClone(t)
  terrain.color = SURFACE_COLORS.default
  terrain.size = [half * 2, 100, depth * 2]
  entities.push(terrain)
  const source = (f: MapFeature) => ({
    provider: 'openstreetmap' as const,
    id: f.id,
    retrievedAt: data.source.retrievedAt,
    tags: compactMapTags(f.tags),
  })
  const waterAreas = data.features
    .filter((f) => isWaterFeature(f.tags))
    .map((f) =>
      f.rings.map((r) => ({
        role: r.role,
        points: r.coordinates.map((p) => {
          const v = project(p)
          return [v[0], v[2]] as [number, number]
        }),
      })),
    )
  const coveredByWater = (p: [number, number]) =>
    waterAreas.some(
      (rings) =>
        rings.some((r) => r.role !== 'inner' && pointInPolygon(p, r.points)) &&
        !rings.some((r) => r.role === 'inner' && pointInPolygon(p, r.points)),
    )
  const district: District = {
    data,
    options,
    entities,
    terrain,
    groups,
    suffix,
    half,
    depth,
    project,
    height,
    inside,
    source,
    footprints: buildingFootprints(data.features, project),
    coveredByWater,
    addSurface: () => {},
  }
  district.addSurface = (f, geometry, part, color, parentId) => {
    for (let first = 0; first < geometry.faces.length; first += 600) {
      const vertices: Vec3Tuple[] = []
      const seen = new Map<string, number>()
      const faces = geometry.faces.slice(first, first + 600).map((face) =>
        face.map((index) => {
          const point = geometry.vertices[index],
            key = point.join(',')
          let local = seen.get(key)
          if (local === undefined) {
            local = vertices.length
            vertices.push(point)
            seen.set(key, local)
          }
          return local
        }),
      )
      const e = createEntity(
        `osm-${f.id.replace('/', '-')}-${part}${suffix}-${first / 600}`,
        'solid',
      )
      e.geometry = { vertices, edges: [], faces }
      e.motion = 'none'
      e.name = f.tags.name ?? `${part} · ${f.id}`
      e.color = color
      e.parentId = parentId
      e.source = source(f)
      if (part === 'waterway') e.landcover = { surface: 'water', isWater: true }
      else e.railway = { part: part === 'ballast' ? 'ballast' : 'rail' }
      entities.push(e)
    }
  }
  return district
}
