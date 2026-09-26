import { ShapeUtils, Vector2 } from 'three'
import { VectorTile, classifyRings } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { pointInPolygon } from '../../math/planar/polygon.js'
import { geoToLocal, tilePoint, type GeoPoint } from '../../math/geo/sphere.js'

type SeaPolygon = { x: number; y: number }[][]

function seaAt(polygons: SeaPolygon[], p: [number, number]) {
  return polygons.some((polygon) => {
    const outer = polygon[0]
    if (!outer || outer.length < 3) return false
    return (
      pointInPolygon(
        p,
        outer.map((q) => [q.x, q.y]),
      ) &&
      !polygon.slice(1).some((ring) =>
        pointInPolygon(
          p,
          ring.map((q) => [q.x, q.y]),
        ),
      )
    )
  })
}
/**
 * Which of the 64 z15 cells inside a z12 tile are ocean.
 * Bit `row * 8 + col` is set, row 0 at the north edge. Islands stay clear.
 */
export function oceanCells(polygons: SeaPolygon[], extent = 4096): Uint8Array {
  const mask = new Uint8Array(8)
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      if (!seaAt(polygons, [((col + 0.5) / 8) * extent, ((row + 0.5) / 8) * extent])) continue
      const bit = row * 8 + col
      mask[bit >> 3] |= 1 << (bit & 7)
    }
  return mask
}
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
): { positions: Float32Array; cells: Uint8Array } {
  const layer = new VectorTile(new Pbf(data)).layers.water
  const positions: number[] = []
  const polygons: { x: number; y: number }[][][] = []
  if (layer)
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i)
      if (feature.type !== 3 || feature.properties.class !== 'ocean') continue
      for (const polygon of classifyRings(feature.loadGeometry())) {
        polygons.push(
          polygon.map((ring) =>
            ring.map((p) => ({
              x: (p.x / feature.extent) * 4096,
              y: (p.y / feature.extent) * 4096,
            })),
          ),
        )
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
  return { positions: new Float32Array(positions), cells: oceanCells(polygons) }
}
