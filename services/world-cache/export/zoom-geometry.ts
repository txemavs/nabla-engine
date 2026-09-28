/** Offline-only clipping and conservative vertex clustering for the XYZ migration pilot. */
export type Vertex = number[] // position(3), normal(3), linear RGB(3)
export function clipTriangle(
  input: Vertex[],
  bounds: { west: number; east: number; north: number; south: number },
): Vertex[][] {
  let polygon = input
  for (const [axis, limit, sign] of [
    [0, bounds.west, 1],
    [0, bounds.east, -1],
    [2, bounds.north, 1],
    [2, bounds.south, -1],
  ]) {
    const output: Vertex[] = []
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length]
      const da = (a[axis] - limit) * sign,
        db = (b[axis] - limit) * sign
      if (da >= 0) output.push(a)
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db)
        const point = a.map((value, j) => value + (b[j] - value) * t)
        point[axis] = limit
        output.push(point)
      }
    }
    polygon = output
  }
  return polygon.slice(2).map((point, i) => [polygon[0], polygon[i + 1], point])
}

/** Retain open mesh boundaries; average interior color within each material batch. Never changes the detailed source. */
export function clusterTriangles(
  input: Vertex[],
  step: number,
): { vertices: Vertex[]; indices: number[] } {
  const vertices: Vertex[] = [],
    indices: number[] = []
  const exact = new Map<string, number>()
  for (const vertex of input) {
    const key = vertex.join(',')
    let index = exact.get(key)
    if (index === undefined) {
      index = vertices.length
      vertices.push(vertex)
      exact.set(key, index)
    }
    indices.push(index)
  }
  if (!step) return { vertices, indices }
  // Geometric boundary detection is independent of split normals.
  const positionIds = new Map<string, number>()
  const position = vertices.map((v) => {
    const key = v
      .slice(0, 3)
      .map((n) => Math.round(n * 1000))
      .join(',')
    if (!positionIds.has(key)) positionIds.set(key, positionIds.size)
    return positionIds.get(key)!
  })
  const edges = new Map<string, number>()
  for (let i = 0; i < indices.length; i += 3)
    for (let j = 0; j < 3; j++) {
      const a = position[indices[i + j]],
        b = position[indices[i + ((j + 1) % 3)]]
      const key = a < b ? `${a}/${b}` : `${b}/${a}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
  const boundary = new Set<number>()
  for (const [edge, count] of edges)
    if (count !== 2) for (const v of edge.split('/')) boundary.add(Number(v))
  const groups = new Map<string, number>(),
    output: Vertex[] = [],
    counts: number[] = []
  const remap = vertices.map((v, i) => {
    const key = boundary.has(position[i])
      ? `edge:${i}`
      : v
          .slice(0, 3)
          .map((x) => Math.floor(x / step))
          .join(',')
    let index = groups.get(key)
    if (index === undefined) {
      index = output.length
      groups.set(key, index)
      output.push(v.map(() => 0))
      counts.push(0)
    }
    counts[index]++
    v.forEach((n, j) => (output[index!][j] += n))
    return index
  })
  output.forEach((v, i) => {
    v.forEach((n, j) => (v[j] = n / counts[i]))
    const length = Math.hypot(...v.slice(3, 6)) || 1
    for (let j = 3; j < 6; j++) v[j] /= length
  })
  const reduced: number[] = [],
    faces = new Set<string>()
  for (let i = 0; i < indices.length; i += 3) {
    const face = indices.slice(i, i + 3).map((index) => remap[index])
    if (new Set(face).size < 3) continue
    const rotations = face.map((_, j) => [...face.slice(j), ...face.slice(0, j)].join('/')).sort()
    if (faces.has(rotations[0])) continue
    faces.add(rotations[0])
    reduced.push(...face)
  }
  return { vertices: output, indices: reduced }
}
