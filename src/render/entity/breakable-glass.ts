import * as THREE from 'three'

/** Remove only the connected glass pane struck by the ray; preserve shared asset geometry. */
export class BreakableGlass {
  private readonly originals = new Map<THREE.Mesh, THREE.BufferGeometry>()
  hit(
    objects: THREE.Object3D[],
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    range: number,
  ): THREE.Vector3 | null {
    const ray = new THREE.Raycaster(origin, direction, 0, range)
    for (const object of objects) object.updateWorldMatrix(true, true)
    const hits = ray.intersectObjects(objects, true)
    for (const hit of hits) {
      if (!(hit.object instanceof THREE.Mesh) || !hit.face || hit.faceIndex == null) continue
      const mesh = hit.object
      let visible = true
      for (let node: THREE.Object3D | null = mesh; node; node = node.parent)
        visible &&= node.visible
      if (!visible) continue
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const material = materials[hit.face.materialIndex]
      if (!material || !material.visible || (material.transparent && material.opacity < 0.05))
        continue
      if (
        mesh.userData.breakableGlass !== true &&
        !/glass|vidrio|cristal|parabrisas|windscreen|window/i.test(material.name)
      )
        return null
      this.removePane(mesh, hit.faceIndex, hit.face.materialIndex)
      return hit.point.clone()
    }
    return null
  }
  private removePane(mesh: THREE.Mesh, struck: number, material: number): void {
    if (!this.originals.has(mesh)) {
      this.originals.set(mesh, mesh.geometry)
      mesh.geometry = mesh.geometry.clone()
    }
    const geometry = mesh.geometry
    const position = geometry.getAttribute('position')
    const index = geometry.index
    const count = index?.count ?? position.count
    const groups = geometry.groups.length
      ? geometry.groups.map((group) => ({ ...group }))
      : [{ start: 0, count, materialIndex: 0 }]
    const vertex = (i: number) => (index ? index.getX(i) : i)
    const key = (i: number) => {
      const v = vertex(i)
      return [position.getX(v), position.getY(v), position.getZ(v)]
        .map((n) => Math.round(n * 100000))
        .join(',')
    }
    const adjacency = new Map<string, number[]>()
    const faces = new Map<number, string[]>()
    for (const group of groups) {
      if ((group.materialIndex ?? 0) !== material) continue
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const keys = [key(i), key(i + 1), key(i + 2)]
        faces.set(i / 3, keys)
        for (const k of keys) adjacency.set(k, [...(adjacency.get(k) ?? []), i / 3])
      }
    }
    const removed = new Set<number>()
    const queue = [struck]
    while (queue.length) {
      const face = queue.pop()!
      if (removed.has(face)) continue
      removed.add(face)
      for (const k of faces.get(face) ?? [])
        for (const next of adjacency.get(k) ?? []) if (!removed.has(next)) queue.push(next)
    }
    const result: number[] = []
    geometry.clearGroups()
    for (const group of groups) {
      const start = result.length
      for (let i = group.start; i < group.start + group.count; i += 3)
        if (!removed.has(i / 3)) result.push(vertex(i), vertex(i + 1), vertex(i + 2))
      geometry.addGroup(start, result.length - start, group.materialIndex ?? 0)
    }
    geometry.setIndex(result)
  }
  clear(): void {
    for (const [mesh, original] of this.originals) {
      mesh.geometry.dispose()
      mesh.geometry = original
    }
    this.originals.clear()
  }
}
