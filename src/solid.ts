import { Vector3 } from 'three'
import type { Vec3Tuple } from './scene.js'

/** Local-space topology, independent of rendering and catalog identity. */
export interface SolidGeometry {
  vertices: Vec3Tuple[]
  edges: [number, number][]
  faces: number[][]
  /** Indices of faces that belong to the roof (for separate roof coloring). */
  roofFaces?: number[]
}
export function boxSolid(size: Vec3Tuple): SolidGeometry {
  const [x, y, z] = size.map((n) => n / 2)
  return {
    vertices: [
      [-x, -y, -z],
      [x, -y, -z],
      [x, y, -z],
      [-x, y, -z],
      [-x, -y, z],
      [x, -y, z],
      [x, y, z],
      [-x, y, z],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ],
    faces: [
      [3, 2, 1, 0],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [2, 3, 7, 6],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
    ],
  }
}
export function faceNormal(g: SolidGeometry, face: number[]): Vector3 {
  const a = new Vector3(...g.vertices[face[0]])
  return new Vector3(...g.vertices[face[1]])
    .sub(a)
    .cross(new Vector3(...g.vertices[face[2]]).sub(a))
    .normalize()
}
export function validateSolid(g: SolidGeometry): void {
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < g.vertices.length
  for (const edge of g.edges)
    if (
      !edge.every(valid) ||
      edge[0] === edge[1] ||
      new Vector3(...g.vertices[edge[0]]).distanceTo(new Vector3(...g.vertices[edge[1]])) < 1e-6
    )
      throw new Error('Invalid solid edge')
  for (const f of g.faces) {
    if (f.length < 3 || !f.every(valid) || new Set(f).size !== f.length)
      throw new Error('Invalid face indices')
    const n = faceNormal(g, f),
      a = new Vector3(...g.vertices[f[0]])
    if (n.lengthSq() < 0.5) throw new Error('Face needs non-collinear points')
    for (let i = 0; i < f.length; i++) {
      const p = new Vector3(...g.vertices[f[i]])
      if (Math.abs(p.clone().sub(a).dot(n)) > 1e-5) throw new Error('Face points must be coplanar')
      const edge = new Vector3(...g.vertices[f[(i + 1) % f.length]]).sub(p)
      const following = new Vector3(...g.vertices[f[(i + 2) % f.length]]).sub(
        new Vector3(...g.vertices[f[(i + 1) % f.length]]),
      )
      if (edge.clone().cross(following).dot(n) < 1e-8)
        throw new Error('Face corners must be distinct and non-collinear')
      // Every other vertex must lie on the inner side: rejects concavity and crossed loops.
      for (const index of f)
        if (
          edge
            .clone()
            .cross(new Vector3(...g.vertices[index]).sub(p))
            .dot(n) < -1e-6
        )
          throw new Error('Use convex faces, ordered around their perimeter')
    }
  }
}
export function triangles(g: SolidGeometry): number[][] {
  return g.faces.flatMap((f) => f.slice(1, -1).map((v, i) => [f[0], v, f[i + 2]]))
}

/** Like triangles but returns whether each triangle is a roof face. */
export function trianglesWithRoofInfo(g: SolidGeometry): {
  indices: number[][]
  isRoof: boolean[]
} {
  const roofSet = new Set(g.roofFaces ?? [])
  const indices: number[][] = []
  const isRoof: boolean[] = []
  for (let faceIdx = 0; faceIdx < g.faces.length; faceIdx++) {
    const f = g.faces[faceIdx]
    const faceIsRoof = roofSet.has(faceIdx)
    for (let i = 1; i < f.length - 1; i++) {
      indices.push([f[0], f[i], f[i + 1]])
      isRoof.push(faceIsRoof)
    }
  }
  return { indices, isRoof }
}
export function removeVertex(g: SolidGeometry, index: number): SolidGeometry {
  const remap = (i: number) => (i > index ? i - 1 : i)
  return {
    vertices: g.vertices.filter((_, i) => i !== index),
    edges: g.edges.filter((e) => !e.includes(index)).map((e) => e.map(remap) as [number, number]),
    faces: g.faces.filter((f) => !f.includes(index)).map((f) => f.map(remap)),
  }
}
export function extrudeFace(
  g: SolidGeometry,
  index: number,
  distance: number,
  axis?: Vec3Tuple,
): SolidGeometry {
  if (!Number.isFinite(distance) || Math.abs(distance) < 0.01)
    throw new Error('Extrusion needs a distance')
  const next = structuredClone(g),
    f = next.faces[index]
  if (!f) throw new Error('Select a face')
  const direction = axis ? new Vector3(...axis).normalize() : faceNormal(g, f)
  if (
    !direction.toArray().every(Number.isFinite) ||
    Math.abs(direction.dot(faceNormal(g, f))) < 1e-6
  )
    throw new Error('El eje de extrusión debe salir del plano de la cara')
  const offset = direction.multiplyScalar(distance)
  const top = f.map(
    (i) => next.vertices.push(new Vector3(...g.vertices[i]).add(offset).toArray()) - 1,
  )
  next.faces[index] = top
  f.forEach((a, i) => {
    const j = (i + 1) % f.length
    next.faces.push([a, f[j], top[j], top[i]])
    next.edges.push([a, top[i]], [top[i], top[j]])
  })
  validateSolid(next)
  return next
}

/** Extrude a point into an edge, or an edge into a quad, by a local-space vector. */
export function extrudeElement(
  g: SolidGeometry,
  kind: 'point' | 'edge',
  index: number,
  offset: Vec3Tuple,
): SolidGeometry {
  if (!offset.every(Number.isFinite) || Math.hypot(...offset) < 0.01)
    throw new Error('Extrusion needs a finite distance')
  const ids = kind === 'point' ? [index] : g.edges[index]
  if (!ids || ids.some((i) => !g.vertices[i])) throw new Error('Select an element')
  const next = structuredClone(g)
  const top = ids.map(
    (i) =>
      next.vertices.push(new Vector3(...g.vertices[i]).add(new Vector3(...offset)).toArray()) - 1,
  )
  ids.forEach((i, j) => next.edges.push([i, top[j]]))
  if (kind === 'edge') {
    next.edges.push([top[0], top[1]])
    next.faces.push([ids[0], ids[1], top[1], top[0]])
  }
  validateSolid(next)
  return next
}
