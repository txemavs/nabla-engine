import { ShapeUtils, Vector2 } from 'three'
import { VectorTile, classifyRings } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { geoToLocal, tilePoint, type GeoPoint } from '../src/math/geo/sphere.js'

/** Preserve polygon holes (islands); never infer sea from elevation alone. */
export function waterPolygon(
  rings: { x: number; y: number; z?: number }[][],
  height: number,
): number[] {
  const opened = rings.map((ring) => {
    const points = ring.slice()
    const last = points.at(-1)
    if (points.length > 1 && last && points[0].x === last.x && points[0].y === last.y) points.pop()
    return points
  })
  const loops = opened.map((ring) => ring.map((p) => new Vector2(p.x, p.y)))
  if (!loops[0] || loops[0].length < 3) return []
  const flat = opened.flat()
  return ShapeUtils.triangulateShape(loops[0], loops.slice(1)).flatMap((face) =>
    face.flatMap((i) => [flat[i].x, flat[i].z ?? height, flat[i].y]),
  )
}
export function decodeSea(
  data: ArrayBuffer,
  x: number,
  y: number,
  zoom: number,
  origin: GeoPoint,
): Float32Array {
  const layer = new VectorTile(new Pbf(data)).layers.water
  const positions: number[] = []
  if (layer)
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i)
      if (feature.type !== 3 || feature.properties.class !== 'ocean') continue
      for (const polygon of classifyRings(feature.loadGeometry())) {
        const rings = polygon.map((ring) =>
          ring.map((p) => {
            const sea = tilePoint(x + p.x / feature.extent, y + p.y / feature.extent, zoom)
            sea.altitude = 0.08
            const local = geoToLocal(origin, sea)
            return { x: local[0], y: local[2], z: local[1] }
          }),
        )
        for (const value of waterPolygon(rings, 0)) positions.push(value)
      }
    }
  return new Float32Array(positions)
}
