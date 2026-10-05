/**
 * Group nearby GLB triangles into chunks.
 * Each triangle belongs to one chunk only. The chunk bounds include the whole triangle.
 * Buildings stay in their own grid so the ground set can load without them.
 */
import {
  isInspectRoadCollisionMesh,
  type PlanetCollisionChunk,
  type PlanetMesh,
} from '../contract.js'

export function planetCollisionChunks(meshes: PlanetMesh[]): PlanetCollisionChunk[] {
  const groups = new Map<string, { values: number[]; bounds: number[]; buildings: boolean }>()
  for (const mesh of meshes) {
    const category = mesh.metadata.category
    // Only the inspect collision GLB stays out of driving. Candidate asphalt/supports
    // collide like other Roads; `drivable: false` is provenance and does not skip them.
    if (isInspectRoadCollisionMesh(mesh.metadata)) continue
    if (!['Terrain', 'Roads', 'Buildings'].includes(category)) continue
    if (mesh.metadata.skirt) continue
    const buildings = category === 'Buildings'
    const count = mesh.index?.length ?? mesh.position.length / 3
    for (let i = 0; i < count; i += 3) {
      const p: number[] = []
      for (let j = 0; j < 3; j++) {
        const k = (mesh.index?.[i + j] ?? i + j) * 3
        p.push(...mesh.position.subarray(k, k + 3))
      }
      const x = (p[0] + p[3] + p[6]) / 3,
        z = (p[2] + p[5] + p[8]) / 3
      const key = `${buildings ? 'b' : 'g'}/${Math.floor(x / 32)}/${Math.floor(z / 32)}`
      let group = groups.get(key)
      if (!group) {
        group = {
          values: [],
          bounds: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity],
          buildings,
        }
        groups.set(key, group)
      }
      group.values.push(...p)
      for (let j = 0; j < 9; j++) {
        const axis = j % 3
        group.bounds[axis] = Math.min(group.bounds[axis], p[j])
        group.bounds[axis + 3] = Math.max(group.bounds[axis + 3], p[j])
      }
    }
  }
  return [...groups].map(([key, g]) => ({
    key,
    buildings: g.buildings,
    bounds: g.bounds as PlanetCollisionChunk['bounds'],
    triangles: new Float32Array(g.values),
  }))
}
