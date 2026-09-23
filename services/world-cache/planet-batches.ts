import { matteGroundMaterial } from '../../playground/ground-material.js'
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
/** Merge by render state with linear vertex colours; no per-building draw call at runtime. */
export function batchPlanetMeshes(root: Group): void {
  const groups = new Map<string, Mesh[]>()
  root.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.isMesh) return
    const key = JSON.stringify([
      mesh.userData.category,
      mesh.userData.groundLayer,
      mesh.userData.transport,
      !!mesh.userData.skirt,
    ])
    const list = groups.get(key) ?? []
    list.push(mesh)
    groups.set(key, list)
  })
  root.clear()
  for (const list of groups.values()) {
    const geometries: BufferGeometry[] = [],
      parts: { id: string; start: number; count: number; source: unknown }[] = []
    let start = 0
    for (const mesh of list) {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      const count = g.getAttribute('position').count
      const material = mesh.material as MeshStandardMaterial
      const previous = g.getAttribute('color')
      const colors = new Float32Array(count * 3)
      for (let i = 0; i < count; i++)
        colors.set(
          previous
            ? [
                previous.getX(i) * material.color.r,
                previous.getY(i) * material.color.g,
                previous.getZ(i) * material.color.b,
              ]
            : material.color.toArray(),
          i * 3,
        )
      g.setAttribute('color', new BufferAttribute(colors, 3))
      parts.push({
        id: mesh.userData.entityId ?? mesh.name,
        start,
        count,
        source: mesh.userData.source,
      })
      start += count
      geometries.push(g)
      mesh.geometry.dispose()
      material.dispose()
    }
    const geometry = mergeGeometries(geometries, false)
    for (const g of geometries) g.dispose()
    if (!geometry) throw Error('Incompatible native mesh attributes')
    const makeMaterial =
      list[0].userData.category === 'Buildings'
        ? (p: import('three').MeshStandardMaterialParameters) => new MeshStandardMaterial(p)
        : matteGroundMaterial
    const material = makeMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 1,
      side: list[0].userData.category === 'Roads' ? 2 : 0,
    })
    // Weld equal render vertices without snapping their coordinates to a grid.
    const indexed = mergeVertices(geometry, 1e-6)
    geometry.dispose()
    const mesh = new Mesh(indexed, material)
    mesh.name = list[0].userData.category
    mesh.userData = { ...list[0].userData, parts }
    delete mesh.userData.entityId
    delete mesh.userData.source
    let group = root.children.find(
      (c) => c.name === (mesh.userData.category === 'Buildings' ? 'Buildings' : 'Ground'),
    ) as Group | undefined
    if (!group) {
      group = new Group()
      group.name = mesh.userData.category === 'Buildings' ? 'Buildings' : 'Ground'
      root.add(group)
    }
    group.add(mesh)
  }
}
