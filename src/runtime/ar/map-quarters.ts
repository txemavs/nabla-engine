import * as T from 'three'

type Vertex = { source?: number; values: Record<string, number[]>; x: number; z: number }
/** Split only triangles crossing cell midlines; retain UVs, normals and material groups. */
export async function splitMapQuarters(content: T.Group): Promise<void> {
  content.updateWorldMatrix(true, true)
  const inverse = content.matrixWorld.clone().invert()
  const sources: T.Mesh[] = []
  content.traverseVisible((o) => {
    if ((o as T.Mesh).isMesh && !/^skirt(?:_|$)/i.test(o.name)) sources.push(o as T.Mesh)
  })
  const quarters = Array.from({ length: 4 }, (_, i) => {
    const group = new T.Group()
    group.userData.atlasQuarter = [i % 2, Math.floor(i / 2)]
    return group
  })
  const old = new Set<T.BufferGeometry>()
  content.traverse((o) => {
    if ((o as T.Mesh).isMesh) old.add((o as T.Mesh).geometry)
  })
  for (const mesh of sources) {
    const geometry = mesh.geometry,
      attributes = Object.entries(geometry.attributes)
    if ((mesh as T.SkinnedMesh).isSkinnedMesh || Object.keys(geometry.morphAttributes).length)
      throw new Error('Atlas quarters require static geometry')
    const transform = inverse.clone().multiply(mesh.matrixWorld)
    const position = geometry.getAttribute('position'),
      index = geometry.index
    const count = index?.count ?? position.count
    const builders = quarters.map(() => ({
      values: Object.fromEntries(attributes.map(([name]) => [name, [] as number[]])),
      remap: new Map<number, number>(),
      indices: new Map<number, number[]>(),
    }))
    const vertex = (id: number): Vertex => {
      const point = new T.Vector3().fromBufferAttribute(position, id).applyMatrix4(transform)
      const values: Record<string, number[]> = {}
      for (const [name, attr] of attributes)
        values[name] = Array.from({ length: attr.itemSize }, (_, c) => attr.getComponent(id, c))
      return { source: id, values, x: point.x, z: point.z }
    }
    const clip = (polygon: Vertex[], axis: 'x' | 'z', sign: number): Vertex[] => {
      const result: Vertex[] = []
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length],
          da = a[axis] * sign,
          db = b[axis] * sign
        if (da >= 0) result.push(a)
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = da / (da - db),
            values: Record<string, number[]> = {}
          for (const [name] of attributes)
            values[name] = a.values[name].map((v, c) => v + (b.values[name][c] - v) * t)
          result.push({ values, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
        }
      }
      return result
    }
    for (let i = 0; i < count; i += 3) {
      const triangle = [0, 1, 2].map((j) => vertex(index ? index.getX(i + j) : i + j))
      const material =
        geometry.groups.find((g) => i >= g.start && i < g.start + g.count)?.materialIndex ?? 0
      for (let q = 0; q < 4; q++) {
        const sx = q % 2 ? 1 : -1,
          sz = q >= 2 ? 1 : -1
        if (triangle.every((v) => v.x * sx < 0) || triangle.every((v) => v.z * sz < 0)) continue
        // A triangle lying exactly on a midline belongs to one side only.
        if (
          (sx < 0 && triangle.every((v) => v.x === 0)) ||
          (sz < 0 && triangle.every((v) => v.z === 0))
        )
          continue
        const polygon = clip(clip(triangle, 'x', sx), 'z', sz)
        const builder = builders[q]
        let indices = builder.indices.get(material)
        if (!indices) builder.indices.set(material, (indices = []))
        const append = (v: Vertex) => {
          if (v.source !== undefined && builder.remap.has(v.source))
            return builder.remap.get(v.source)!
          const id = builder.values.position.length / 3
          for (const [name] of attributes) builder.values[name].push(...v.values[name])
          if (v.source !== undefined) builder.remap.set(v.source, id)
          return id
        }
        for (let j = 1; j + 1 < polygon.length; j++)
          indices.push(append(polygon[0]), append(polygon[j]), append(polygon[j + 1]))
      }
      if (i % 24576 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    for (let q = 0; q < 4; q++) {
      const builder = builders[q]
      if (!builder.values.position.length) continue
      const next = new T.BufferGeometry(),
        indices: number[] = []
      for (const [name, attr] of attributes)
        next.setAttribute(name, new T.Float32BufferAttribute(builder.values[name], attr.itemSize))
      for (const [material, list] of builder.indices) {
        next.addGroup(indices.length, list.length, material)
        for (const n of list) indices.push(n)
      }
      next.setIndex(indices)
      if (next.getAttribute('normal')) next.normalizeNormals()
      else next.computeVertexNormals()
      next.computeBoundingBox()
      next.computeBoundingSphere()
      const part = new T.Mesh(next, mesh.material)
      part.name = mesh.name
      part.userData = { ...mesh.userData }
      part.renderOrder = mesh.renderOrder
      part.matrix.copy(transform)
      part.matrixAutoUpdate = false
      quarters[q].add(part)
    }
    old.add(geometry)
  }
  content.clear()
  content.add(...quarters)
  for (const geometry of old) geometry.dispose()
}
