/**
 * OSM building solids for one district.
 * Generic outlines with detailed parts are excluded by buildingFootprints.
 * The flat cap is replaced when the roof tag is one this engine can build.
 */
import { ShapeUtils, Vector2, Vector3 } from 'three'
import type { MapFeature } from '../extract/contract.js'
import { normalizeColor } from '../extract/tags.js'
import { buildingRoofWithFaces } from '../buildings/buildings.js'
import { createEntity } from '../../entity/schema.js'
import type { SolidGeometry } from '../../math/solid/mesh.js'
import { type District, metric } from './district.js'

export function emitBuilding(d: District, f: MapFeature): boolean {
  const tags = f.tags
  if (tags.building === 'no' || tags['building:part'] === 'no') return true
  if (!(tags.building || tags['building:part'])) return false
  const rings = f.rings.map((r) => ({ ...r, points: r.coordinates.map(d.project) }))
  if (!rings.length || rings.some((r) => r.points.length < 4)) return true
  const g: SolidGeometry = { vertices: [], edges: [], faces: [] }
  const all = rings.flatMap((r) => r.points),
    cx = all.reduce((s, p) => s + p[0], 0) / all.length,
    cz = all.reduce((s, p) => s + p[2], 0) / all.length
  if (cx < -d.half || cx >= d.half || cz < -d.depth || cz >= d.depth) return true
  const base = Math.min(...all.map((p) => d.height(p[0], p[2])))
  const bottom = metric(tags.min_height, metric(tags['building:min_level'], 0) * 3)
  const top = Math.max(
    bottom + 1,
    metric(
      tags.height,
      metric(tags['building:levels'], tags.building === 'industrial' ? 2 : 3) * 3,
    ),
  )
  const polygons = (d.footprints.get(f.id) ?? []).map(({ contour, holes }) => ({
    contour: contour.map((p) => p.clone().sub(new Vector2(cx, cz))),
    holes: holes.map((r) => r.map((p) => p.clone().sub(new Vector2(cx, cz)))),
  }))
  for (const { contour, holes } of polygons) {
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
  if (!g.faces.length || g.vertices.length > 2048) return true
  const e = createEntity('osm-' + f.id.replace('/', '-'), 'solid', [cx, base, cz])
  const roofResult = buildingRoofWithFaces(g, tags)
  e.geometry = { ...roofResult.geometry, roofFaces: roofResult.roofFaces }
  e.name = tags.name ?? `Edificio · ${f.id}`
  // building:colour / building:color for walls
  e.color = normalizeColor(tags['building:colour'] ?? tags['building:color'], '#b9b5a8')
  // roof:colour / roof:color for roof faces
  const roofColorTag = tags['roof:colour'] ?? tags['roof:color']
  if (roofColorTag && roofResult.roofFaces.length > 0) {
    e.roofColor = normalizeColor(roofColorTag, e.color)
  }
  e.parentId = d.groups[0]
  e.source = d.source(f)
  e.size = [
    Math.max(0.01, Math.max(...all.map((p) => p[0])) - Math.min(...all.map((p) => p[0]))),
    top - bottom,
    Math.max(0.01, Math.max(...all.map((p) => p[2])) - Math.min(...all.map((p) => p[2]))),
  ]
  d.entities.push(e)
  return true
}
