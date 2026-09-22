import polygonClipping, { type MultiPolygon } from 'polygon-clipping'
import { Vector2 } from 'three'
import { buildingRings } from './building-rings.js'
import type { MapFeature } from './real-world.js'
import type { Vec3Tuple } from './scene.js'

/** Detailed OSM parts replace the corresponding area of the generic outline.
 * Keep uncovered areas, and never cut a neighboring building with an unrelated part.
 * Runs during tile generation, not in the render loop. */
export function buildingFootprints(
  features: MapFeature[],
  project: (p: [number, number]) => Vec3Tuple,
) {
  const buildings = features
    .filter(
      (f) =>
        (f.tags.building || f.tags['building:part']) &&
        f.tags.building !== 'no' &&
        f.tags['building:part'] !== 'no',
    )
    .map((f) => {
      const polygons: MultiPolygon = buildingRings(
        f.rings.map((r) => ({
          role: r.role,
          points: r.coordinates.map((c) => {
            const p = project(c)
            return new Vector2(p[0], p[2])
          }),
        })),
      ).map(({ contour, holes }) => [contour, ...holes].map((ring) => ring.map((p) => [p.x, p.y])))
      const points = polygons.flat(2)
      return {
        f,
        polygons,
        bounds: [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
      }
    })
  const parts = buildings.filter((b) => b.f.tags['building:part'] && b.polygons.length)
  const result = new Map<string, ReturnType<typeof buildingRings>>()
  for (const b of buildings) {
    let polygons = b.polygons
    if (!b.f.tags['building:part'] && polygons.length) {
      const candidates = parts.filter(
        (p) =>
          p.bounds[0] >= b.bounds[0] - 0.001 &&
          p.bounds[1] >= b.bounds[1] - 0.001 &&
          p.bounds[2] <= b.bounds[2] + 0.001 &&
          p.bounds[3] <= b.bounds[3] + 0.001,
      )
      try {
        const contained = candidates.filter(
          (p) => polygonClipping.difference(p.polygons, polygons).length === 0,
        )
        if (contained.length)
          polygons = polygonClipping.difference(polygons, ...contained.map((p) => p.polygons))
      } catch {
        // Invalid upstream polygons must not prevent the rest of the tile loading.
      }
    }
    result.set(
      b.f.id,
      buildingRings(
        polygons.flatMap((p) =>
          p.map((r, i) => ({
            role: i ? 'inner' : 'outer',
            points: r.map((c) => new Vector2(...c)),
          })),
        ),
      ),
    )
  }
  return result
}
