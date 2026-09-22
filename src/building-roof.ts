import { Vector3 } from 'three'
import type { SolidGeometry } from './solid.js'
import type { Vec3Tuple } from './scene.js'

/** Roof face indices for shapes that produce consistent roof geometry.
 * Returns indices of faces that are part of the roof (not walls or floor). */
export interface RoofResult {
  geometry: SolidGeometry
  roofFaces: number[]
}

/** Conservative roof support for single, approximately rectangular OSM footprints. */
export function buildingRoof(g: SolidGeometry, tags: Record<string, string>): SolidGeometry {
  return buildingRoofWithFaces(g, tags).geometry
}

/** Like buildingRoof but also returns which faces are roof faces (for coloring). */
export function buildingRoofWithFaces(g: SolidGeometry, tags: Record<string, string>): RoofResult {
  const flat = (): RoofResult => {
    const top = Math.max(...g.vertices.map((v) => v[1]))
    const roofFaces = g.faces.flatMap((face, i) =>
      face.every((v) => Math.abs(g.vertices[v][1] - top) < 0.001) ? [i] : [],
    )
    return { geometry: g, roofFaces }
  }
  const shape = tags['roof:shape']
  if (!['gabled', 'hipped', 'skillion', 'pyramidal'].includes(shape) || g.vertices.length !== 8)
    return flat()
  const corners = g.vertices.slice(0, 4).map((p) => new Vector3(...p))
  const edges = corners.map((p, i) => corners[(i + 1) % 4].clone().sub(p))
  if (
    edges.some(
      (e, i) =>
        Math.abs(
          e
            .clone()
            .normalize()
            .dot(edges[(i + 1) % 4].clone().normalize()),
        ) > 0.1,
    )
  )
    return flat()
  const bottom = g.vertices[0][1],
    top = g.vertices[4][1]
  const short = Math.min(...edges.map((e) => e.length()))
  const specified = Number.parseFloat(tags['roof:height'] ?? '')
  const rise = Math.min(
    (top - bottom) * 0.8,
    Number.isFinite(specified) ? specified : Math.min(3, short * 0.3),
  )
  if (rise <= 0) return flat()
  // Start at a short end: the inferred ridge runs along the longer building axis.
  const first = edges[0].length() <= edges[1].length() ? 0 : 1
  const vertices: Vec3Tuple[] = []
  for (const y of [bottom, top - rise])
    for (let i = 0; i < 4; i++) {
      const p = corners[(first + i) % 4]
      vertices.push([p.x, y, p.z])
    }
  const faces: number[][] = [
    [0, 1, 2],
    [0, 2, 3],
  ]
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    faces.push([i, j, j + 4], [i, j + 4, i + 4])
  }
  let roofFaces: number[] = []
  if (shape === 'skillion') {
    vertices[6][1] = vertices[7][1] = top
    const roofStart = faces.length
    faces.push([4, 5, 6], [4, 6, 7])
    roofFaces = [roofStart, roofStart + 1]
  } else if (shape === 'pyramidal') {
    // Pyramidal: single apex at footprint center
    const cx = (vertices[4][0] + vertices[5][0] + vertices[6][0] + vertices[7][0]) / 4
    const cz = (vertices[4][2] + vertices[5][2] + vertices[6][2] + vertices[7][2]) / 4
    vertices.push([cx, top, cz])
    const apex = 8
    const roofStart = faces.length
    faces.push([4, 5, apex], [5, 6, apex], [6, 7, apex], [7, 4, apex])
    roofFaces = [roofStart, roofStart + 1, roofStart + 2, roofStart + 3]
  } else {
    const a = new Vector3(...vertices[4]).add(new Vector3(...vertices[5])).multiplyScalar(0.5)
    const b = new Vector3(...vertices[6]).add(new Vector3(...vertices[7])).multiplyScalar(0.5)
    if (shape === 'hipped') {
      const axis = b.clone().sub(a)
      const inset = Math.min(short / 2, axis.length() * 0.4)
      axis.normalize().multiplyScalar(inset)
      a.add(axis)
      b.sub(axis)
    }
    a.y = b.y = top
    vertices.push(a.toArray(), b.toArray())
    const roofStart = faces.length
    faces.push([4, 5, 8], [6, 7, 9], [5, 6, 9], [5, 9, 8], [7, 4, 8], [7, 8, 9])
    roofFaces = [roofStart + 2, roofStart + 3, roofStart + 4, roofStart + 5]
    if (shape === 'hipped') roofFaces.unshift(roofStart, roofStart + 1)
  }
  // Triangular faces stay valid after millimetre serialization of surveyed footprints.
  const center = vertices
    .reduce((s, p) => s.add(new Vector3(...p)), new Vector3())
    .divideScalar(vertices.length)
  const unique = new Map<string, [number, number]>()
  for (const face of faces) {
    const [a, b, c] = face.map((i) => new Vector3(...vertices[i]))
    if (b.clone().sub(a).cross(c.clone().sub(a)).dot(a.clone().sub(center)) < 0) face.reverse()
    for (let i = 0; i < 3; i++) {
      const pair = [face[i], face[(i + 1) % 3]].sort((a, b) => a - b) as [number, number]
      unique.set(pair.join(','), pair)
    }
  }
  return { geometry: { vertices, faces, edges: [...unique.values()], roofFaces }, roofFaces }
}
