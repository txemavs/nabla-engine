import clipping, { type MultiPolygon, type Polygon } from 'polygon-clipping'
import { geoToLocal } from './geography.js'
import { createEntity, type SceneDocument, type Entity, type Vec3Tuple } from './scene.js'
import { drapeLandcoverPolygon } from './real-world.js'
import type { RoadAreaSnapshot } from './map-provider.js'
import type { SolidGeometry } from './solid.js'

/** Offline surface composition. Centerline/physics entities keep their identity and behavior. */
export function combineRoadSurfaces(doc: SceneDocument, snapshot: RoadAreaSnapshot): number {
  if (doc.entities.some((e) => e.mapEditable || e.source?.provider === 'geoeuskadi'))
    throw Error('Compose a fresh baseline; do not overwrite authored or previously combined roads')
  const terrain = doc.entities.find((e) => e.id === 'world-terrain')
  if (!terrain?.terrain || !doc.geography) throw Error('Pilot requires an origin and terrain')
  const t = terrain.terrain,
    origin = doc.geography
  const official: MultiPolygon = []
  for (const f of snapshot.features) {
    const p = f.properties
    if (p.SITUACION !== 'SUP' || p.ESTADO !== 'USO' || p.COMPONEN2D !== 'CGN') continue
    const polygons =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const polygon of polygons)
      official.push(
        polygon.map((r) =>
          r.map(([longitude, latitude]) => {
            const v = geoToLocal(origin, { longitude, latitude, altitude: origin.altitude })
            return [v[0], v[2]]
          }),
        ),
      )
  }
  if (!official.length) return 0
  const hx = ((t.columns - 1) * t.spacing) / 2,
    hz = ((t.rows - 1) * t.spacing) / 2
  const bounds: Polygon = [
    [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
      [-hx, -hz],
    ],
  ]
  const mask = clipping.intersection(clipping.union(official), bounds)
  if (!mask.length) return 0
  let count = 0
  function add(
    polygons: MultiPolygon,
    id: string,
    color: string,
    source: Entity['source'],
    offset = 0.035,
  ) {
    for (const polygon of polygons) {
      const g = drapeLandcoverPolygon(
        polygon.map((r, i) => ({
          role: i ? 'inner' : 'outer',
          points: r.map(([x, z]) => [x, 0, z] as Vec3Tuple),
        })),
        t,
        offset,
      )
      for (let start = 0; start < g.faces.length; start += 500) {
        const geometry: SolidGeometry = { vertices: [], edges: [], faces: [] }
        const seen = new Map<string, number>()
        for (const face of g.faces.slice(start, start + 500)) {
          const indices = face.map((i) => {
            const vertex = g.vertices[i],
              key = vertex.join(',')
            let index = seen.get(key)
            if (index === undefined) {
              index = geometry.vertices.length
              geometry.vertices.push(vertex)
              seen.set(key, index)
            }
            return index
          })
          geometry.faces.push(indices)
        }
        const entity = createEntity(`${id}-surface-${count++}`, 'solid')
        entity.geometry = geometry
        entity.source = source
        entity.landcover = { surface: 'default', isWater: false }
        entity.color = color
        entity.motion = 'none'
        entity.parentId = 'world-roads'
        entity.name = source?.provider === 'geoeuskadi' ? 'Calzada · geoEuskadi' : 'Calzada · OSM'
        doc.entities.push(entity)
      }
    }
  }
  for (const e of [...doc.entities]) {
    if (
      !e.road ||
      e.mapEditable ||
      e.road.renderSuppressed ||
      (e.road.elevation && e.road.elevation !== 'terrain') ||
      (e.road.layer ?? 0) !== 0 ||
      e.road.mode === 'smooth-float'
    )
      continue
    // Use the exact existing ribbon footprint, then cut only its overlap with official surfaces.
    const patches: MultiPolygon = []
    const joints = new Map<string, Vec3Tuple>()
    for (const path of e.road.paths) {
      for (const p of path) joints.set(`${p[0]},${p[2]}`, p)
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i],
          dx = b[0] - a[0],
          dz = b[2] - a[2],
          length = Math.hypot(dx, dz)
        if (length < 0.01) continue
        const nx = ((dz / length) * e.road.width) / 2,
          nz = ((-dx / length) * e.road.width) / 2
        patches.push([
          [
            [a[0] + nx, a[2] + nz],
            [b[0] + nx, b[2] + nz],
            [b[0] - nx, b[2] - nz],
            [a[0] - nx, a[2] - nz],
            [a[0] + nx, a[2] + nz],
          ],
        ])
      }
    }
    for (const p of joints.values()) {
      const ring = Array.from({ length: 12 }, (_, i): [number, number] => [
        p[0] + (Math.cos((i * Math.PI) / 6) * e.road!.width) / 2,
        p[2] + (Math.sin((i * Math.PI) / 6) * e.road!.width) / 2,
      ])
      ring.push(ring[0])
      patches.push([ring])
    }
    if (!patches.length) continue
    const footprint = clipping.intersection(clipping.union(patches), bounds)
    if (!clipping.intersection(footprint, mask).length) continue
    const remainder = clipping.difference(footprint, mask)
    add(
      remainder,
      e.id,
      e.color,
      e.source,
      ['footway', 'path', 'pedestrian', 'cycleway'].includes(e.source?.tags.highway ?? '')
        ? 0.025
        : 0.035,
    )
    e.road.renderSuppressed = true
  }
  add(mask, 'geoeuskadi-bta', '#525c60', {
    provider: 'geoeuskadi',
    dataset: snapshot.dataset,
    revision: snapshot.revision,
    id: 'road-area-union',
    retrievedAt: snapshot.retrievedAt,
    tags: {},
  })
  // This explicit pilot is authored coverage: global streaming must not overwrite its composition.
  // Keep the original OSM baseline hash; the changed tile is recognized as pinned.
  return count
}
