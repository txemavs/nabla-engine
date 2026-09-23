import type { TileArtifact } from '../../playground/tile-asset.js'

/** Render-only ground compaction. Never quantize thin rails or modify collision metadata. */
export function compactGround(data: TileArtifact, step: number): TileArtifact {
  if (![0.1, 1].includes(step)) throw Error('Unsupported ground precision')
  const geometry = { ...data.geometry }
  for (const entity of data.entities) {
    const source = geometry[entity.id]
    if (!source || (!entity.terrain && !entity.landcover) || entity.mapEditable) continue
    const p = new Float32Array(source.position)
    const sourceNormals = new Float32Array(source.normal)
    const colors = source.color ? new Float32Array(source.color) : undefined
    const input = source.index ? new Uint32Array(source.index) : undefined
    const positions: number[] = [],
      outputColors: number[] = [],
      normals: number[] = [],
      indices: number[] = []
    const vertices = new Map<string, number>(),
      faces = new Set<string>()
    const count = input?.length ?? p.length / 3
    for (let i = 0; i < count; i += 3) {
      const triangle: number[] = []
      for (let j = 0; j < 3; j++) {
        const v = input?.[i + j] ?? i + j
        // Preserve elevation: separately rounding ground and draped surfaces buries roads.
        // Only horizontal coordinates are snapped; thin layer offsets stay exact.
        const point = [0, 1, 2].map((axis) =>
          axis === 1 || entity.landcover
            ? p[v * 3 + axis]
            : Math.round(p[v * 3 + axis] / step) * step,
        )
        const color = colors ? Array.from(colors.subarray(v * 3, v * 3 + 3)) : []
        const normal = Array.from(sourceNormals.subarray(v * 3, v * 3 + 3))
        const key = [...point, ...normal, ...color].join(',')
        let index = vertices.get(key)
        if (index === undefined) {
          index = positions.length / 3
          vertices.set(key, index)
          positions.push(...point)
          normals.push(...normal)
          outputColors.push(...color)
        }
        triangle.push(index)
      }
      if (new Set(triangle).size !== 3) continue
      const [a, b, c] = triangle.map((v) => positions.slice(v * 3, v * 3 + 3))
      const u = b.map((x, i) => x - a[i]),
        v = c.map((x, i) => x - a[i])
      if (
        Math.hypot(
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ) < 1e-10
      )
        continue
      const first = triangle.indexOf(Math.min(...triangle))
      const key = [triangle[first], triangle[(first + 1) % 3], triangle[(first + 2) % 3]].join(',')
      if (faces.has(key)) continue
      faces.add(key)
      indices.push(...triangle)
    }
    // Drop vertices belonging only to collapsed triangles.
    const used = new Map<number, number>(),
      compact: number[] = [],
      compactColors: number[] = [],
      compactNormals: number[] = []
    const mapped = indices.map((old) => {
      let n = used.get(old)
      if (n === undefined) {
        n = used.size
        used.set(old, n)
        compact.push(...positions.slice(old * 3, old * 3 + 3))
        compactNormals.push(...normals.slice(old * 3, old * 3 + 3))
        if (colors) compactColors.push(...outputColors.slice(old * 3, old * 3 + 3))
      }
      return n
    })
    geometry[entity.id] = {
      position: new Float32Array(compact).buffer,
      normal: new Float32Array(compactNormals).buffer,
      index: new Uint32Array(mapped).buffer,
      ...(colors ? { color: new Float32Array(compactColors).buffer } : {}),
    }
  }
  return { ...data, geometry }
}
