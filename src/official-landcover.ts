import { pointInPolygon } from './multipolygon.js'
import { geoToLocal } from './geography.js'
import { terrainVertices } from './terrain.js'
import { classifySurface, isLandcoverFeature, SURFACE_COLORS } from './landcover.js'
import type { WorldExtract } from './real-world.js'
import type { SceneDocument } from './scene.js'
import { z } from 'zod'
const point = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
const ring = z.array(point).min(4)
const polygon = z.array(ring).min(1)
const schema = z.object({
  dataset: z.literal('bta5-land-use-11'),
  complete: z.literal(true),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  retrievedAt: z.string(),
  colors: z.record(z.string(), z.string().regex(/^#[0-9a-f]{6}$/)),
  features: z.array(
    z.object({
      properties: z.object({ LEYENDA_1: z.string() }),
      geometry: z.discriminatedUnion('type', [
        z.object({ type: z.literal('Polygon'), coordinates: polygon }),
        z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygon) }),
      ]),
    }),
  ),
})
/** Bake official land-use colours into existing terrain vertices: no extra draw calls. */
export function applyOfficialLandcover(doc: SceneDocument, raw: unknown, extract: WorldExtract) {
  const data = schema.parse(raw),
    terrain = doc.entities.find((e) => e.id === 'world-terrain')!
  const project = (p: [number, number]): [number, number] => {
    const v = geoToLocal(extract.origin, {
      longitude: p[0],
      latitude: p[1],
      altitude: extract.origin.altitude,
    })
    return [v[0], v[2]]
  }
  const official = data.features.flatMap((f) => {
    const color = data.colors[f.properties.LEYENDA_1]
    if (!color) throw Error('Missing official legend colour')
    return (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(
      (p) => ({ color, rings: p.map((r) => r.map(project)) }),
    )
  })
  const fallback = extract.features
    .filter((f) => isLandcoverFeature(f.tags))
    .map((f) => ({
      color: SURFACE_COLORS[classifySurface(f.tags)],
      rings: f.rings.map((r) => ({ role: r.role, points: r.coordinates.map(project) })),
    }))
  let matched = 0
  terrain.terrain!.colors = terrainVertices(terrain.terrain!).map(([x, , z]) => {
    const p: [number, number] = [x, z]
    const match = official.find(
      (f) => pointInPolygon(p, f.rings[0]) && !f.rings.slice(1).some((h) => pointInPolygon(p, h)),
    )
    if (match) {
      matched++
      return match.color
    }
    let color = terrain.color
    for (const f of fallback)
      if (
        f.rings.some((r) => r.role !== 'inner' && pointInPolygon(p, r.points)) &&
        !f.rings.some((r) => r.role === 'inner' && pointInPolygon(p, r.points))
      )
        color = f.color
    return color
  })
  // Non-water land-cover is now baked into the terrain, including OSM fallback outside coverage.
  // Keep water and composed road surfaces as independent geometry.
  doc.entities = doc.entities.filter(
    (e) => !(e.landcover && !e.landcover.isWater && e.parentId === 'world-landcover'),
  )
  terrain.source = {
    provider: 'geoeuskadi',
    dataset: data.dataset,
    revision: data.revision,
    id: 'terrain-land-use-palette',
    retrievedAt: data.retrievedAt,
    tags: {},
  }
  return matched
}
