import { ShapeUtils, Vector2 } from 'three'
import { VectorTile, classifyRings } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { geoToLocal, tilePoint, type GeoPoint } from '../src/geography.js'

/** Preserve polygon holes (islands); never infer sea from elevation alone. */
export function waterPolygon(rings: { x: number; y: number }[][], height: number): number[] {
  const loops = rings.map((ring) => {
    const points = ring.map((p) => new Vector2(p.x, p.y))
    if (points.length > 1 && points[0].equals(points[points.length - 1])) points.pop()
    return points
  })
  if (!loops[0] || loops[0].length < 3) return []
  const flat = loops.flat()
  return ShapeUtils.triangulateShape(loops[0], loops.slice(1)).flatMap((face) =>
    face.flatMap((i) => [flat[i].x, height, flat[i].y]),
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
            const local = geoToLocal(
              origin,
              tilePoint(x + p.x / feature.extent, y + p.y / feature.extent, zoom),
            )
            return { x: local[0], y: local[2] }
          }),
        )
        for (const value of waterPolygon(rings, -origin.altitude + 0.08)) positions.push(value)
      }
    }
  return new Float32Array(positions)
}
