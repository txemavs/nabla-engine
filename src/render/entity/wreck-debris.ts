import * as THREE from 'three'

export type DebrisCast = (
  from: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  excludeEntityId?: string,
) => { point: THREE.Vector3; normal: THREE.Vector3 } | null

/** Visual wreck components with gravity and swept world collision; shared geometry is never disposed. */
export class WreckDebris {
  readonly root = new THREE.Group()
  readonly pieces: {
    entityId: string
    pivot: THREE.Group
    velocity: THREE.Vector3
    spin: THREE.Vector3
    age: number
    materials: {
      material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial
      color: THREE.Color
    }[]
  }[] = []
  private originals = new Map<THREE.Mesh, boolean>()
  constructor(private readonly space: THREE.Group) {
    this.root.name = 'Detached wreck parts'
    space.add(this.root)
  }
  explode(object: THREE.Object3D, entityId: string): THREE.Group[] {
    object.updateWorldMatrix(true, true)
    const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3())
    this.space.worldToLocal(center)
    const sources: THREE.Mesh[] = []
    object.traverseVisible((node) => {
      if (node instanceof THREE.Mesh && !(node instanceof THREE.SkinnedMesh)) sources.push(node)
    })
    const created: THREE.Group[] = []
    for (const source of sources.slice(0, 128)) {
      if (this.originals.has(source)) continue
      const mesh = new THREE.Mesh(
        source.geometry,
        Array.isArray(source.material)
          ? source.material.map((m) => m.clone())
          : source.material.clone(),
      )
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        .filter(
          (m): m is THREE.MeshStandardMaterial | THREE.MeshBasicMaterial =>
            m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshBasicMaterial,
        )
        .map((material) => ({ material, color: material.color.clone() }))
      const matrix = new THREE.Matrix4()
        .copy(this.space.matrixWorld)
        .invert()
        .multiply(source.matrixWorld)
      matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
      const pivot = new THREE.Group()
      pivot.name = source.name || 'Wreck component'
      const localCenter = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
      pivot.position.copy(localCenter)
      mesh.position.sub(localCenter)
      pivot.add(mesh)
      this.root.add(pivot)
      const velocity = localCenter.clone().sub(center)
      if (velocity.lengthSq() < 0.01)
        velocity.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      velocity.normalize().multiplyScalar(4 + Math.random() * 5)
      velocity.y += 2
      this.pieces.push({
        entityId,
        pivot,
        velocity,
        spin: new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).multiplyScalar(8),
        age: 0,
        materials,
      })
      this.originals.set(source, source.visible)
      source.visible = false
      created.push(pivot)
      if (this.pieces.length > 256) this.removeFirst()
    }
    return created.filter((p) => !!p.parent)
  }
  update(dt: number, cast?: DebrisCast): void {
    for (const piece of this.pieces) {
      piece.age += dt
      const { pivot, velocity } = piece
      velocity.y -= 9.8 * dt
      const step = velocity.clone().multiplyScalar(dt),
        distance = step.length()
      const hit =
        distance > 0 && cast
          ? cast(pivot.position, step.clone().normalize(), distance + 0.06, piece.entityId)
          : null
      if (hit) {
        pivot.position.copy(hit.point).addScaledVector(hit.normal, 0.06)
        const inward = velocity.dot(hit.normal)
        if (inward < 0) velocity.addScaledVector(hit.normal, -1.3 * inward)
        velocity.multiplyScalar(0.65)
        piece.spin.multiplyScalar(0.7)
      } else pivot.position.add(step)
      pivot.rotateX(piece.spin.x * dt)
      pivot.rotateY(piece.spin.y * dt)
      pivot.rotateZ(piece.spin.z * dt)
      const char = Math.min(1, piece.age / 2.5)
      for (const { material, color } of piece.materials) {
        material.color.copy(color).lerp(new THREE.Color('#171717'), char)
        if (material instanceof THREE.MeshStandardMaterial) {
          material.emissive.set('#ff4008')
          material.emissiveIntensity = Math.max(0, 1 - piece.age / 6) * 0.7
          material.roughness = Math.max(material.roughness, char * 0.95)
        }
      }
    }
    while (this.pieces.length && this.pieces[0].age > 30) this.removeFirst()
  }
  private removeFirst(): void {
    const piece = this.pieces.shift()!
    piece.pivot.traverse((node) => {
      if (node instanceof THREE.Mesh)
        for (const material of Array.isArray(node.material) ? node.material : [node.material])
          material.dispose()
    })
    piece.pivot.removeFromParent()
  }
  clear(): void {
    while (this.pieces.length) this.removeFirst()
    for (const [mesh, visible] of this.originals) mesh.visible = visible
    this.originals.clear()
  }
  dispose(): void {
    this.clear()
    this.root.removeFromParent()
  }
}
