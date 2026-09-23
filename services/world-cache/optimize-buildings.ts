import { isMapBuilding, type Entity } from '../../src/scene.js'
import type { MapGeometryBuffers, PreparedMapGeometry } from '../../playground/map-geometry.js'

const bytes = (g: MapGeometryBuffers) =>
  g.position.byteLength +
  g.normal.byteLength +
  (g.color?.byteLength ?? 0) +
  (g.index?.byteLength ?? 0)

/** Exact render-buffer compaction only: never changes scene topology or merges entities. */
export function optimizePreparedBuildings(entities: Entity[], geometry: PreparedMapGeometry) {
  const report = {
    buildings: 0,
    optimized: 0,
    verticesBefore: 0,
    verticesAfter: 0,
    trianglesBefore: 0,
    trianglesAfter: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  }
  for (const entity of entities) {
    const source = geometry[entity.id]
    if (!source || !isMapBuilding(entity) || entity.mapEditable) continue
    report.buildings++
    const positions: number[] = [],
      normals: number[] = [],
      colors: number[] = [],
      indices: number[] = []
    const vertices = new Map<string, number>(),
      faces = new Set<string>()
    const count = source.index?.length ?? source.position.length / 3
    for (let i = 0; i < count; i += 3) {
      const triangle: number[] = []
      for (let j = 0; j < 3; j++) {
        const vertex = source.index?.[i + j] ?? i + j
        const p = Array.from(source.position.subarray(vertex * 3, vertex * 3 + 3))
        const n = Array.from(source.normal.subarray(vertex * 3, vertex * 3 + 3))
        const c = source.color ? Array.from(source.color.subarray(vertex * 3, vertex * 3 + 3)) : []
        const key = [...p, ...n, ...c].join(',')
        let id = vertices.get(key)
        if (id === undefined) {
          id = positions.length / 3
          vertices.set(key, id)
          positions.push(...p)
          normals.push(...n)
          colors.push(...c)
        }
        triangle.push(id)
      }
      // Cyclic permutations are duplicates; reversed winding remains distinct.
      const first = triangle.indexOf(Math.min(...triangle))
      const key = [triangle[first], triangle[(first + 1) % 3], triangle[(first + 2) % 3]].join(',')
      if (faces.has(key)) continue
      faces.add(key)
      indices.push(...triangle)
    }
    const compact: MapGeometryBuffers = {
      position: new Float32Array(positions),
      normal: new Float32Array(normals),
      index: new Uint32Array(indices),
      ...(source.color ? { color: new Float32Array(colors) } : {}),
    }
    const output = bytes(compact) < bytes(source) ? compact : source
    if (output !== source) {
      geometry[entity.id] = output
      report.optimized++
    }
    report.verticesBefore += source.position.length / 3
    report.verticesAfter += output.position.length / 3
    report.trianglesBefore += count / 3
    report.trianglesAfter += (output.index?.length ?? output.position.length / 3) / 3
    report.bytesBefore += bytes(source)
    report.bytesAfter += bytes(output)
  }
  return report
}
