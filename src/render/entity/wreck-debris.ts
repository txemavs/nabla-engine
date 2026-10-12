import { explosionTuning } from '../../config/gameplay-tuning.js'
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
    axle: THREE.Vector3
    radius: number
    width: number
    resting: boolean
    rolling: boolean
    halfSize: THREE.Vector3
    velocity: THREE.Vector3
    spin: THREE.Vector3
    age: number
    materials: {
      material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial
      color: THREE.Color
    }[]
  }[] = []
  private originals = new Map<THREE.Object3D, boolean>()
  private prepared = new Map<THREE.Object3D, THREE.Object3D>()
  constructor(private readonly space: THREE.Group) {
    this.root.name = 'Detached wreck parts'
    space.add(this.root)
  }
  private parts(object: THREE.Object3D): THREE.Object3D[] {
    const parts: THREE.Object3D[] = []
    object.traverseVisible((node) => {
      if (
        node !== object &&
        (node.userData.wreckPart || /^(Wheel(?:[_ -]|$)|Rueda(?:[_ -]|$))/i.test(node.name))
      )
        parts.push(node)
    })
    return parts.filter((node) => {
      for (let parent = node.parent; parent && parent !== object; parent = parent.parent)
        if (parts.includes(parent)) return false
      return true
    })
  }
  prepare(object: THREE.Object3D): void {
    const parts = this.parts(object)
    for (const source of parts) {
      if (this.prepared.has(source) || this.originals.has(source)) continue
      const clone = source.clone(true)
      clone.traverse((node) => {
        if (node instanceof THREE.Mesh)
          node.material = Array.isArray(node.material)
            ? node.material.map((m) => m.clone())
            : node.material.clone()
      })
      this.prepared.set(source, clone)
    }
  }
  warmRoot(): THREE.Group {
    const group = new THREE.Group()
    for (const clone of this.prepared.values()) group.add(clone)
    return group
  }
  explode(object: THREE.Object3D, entityId: string, extra: THREE.Object3D[] = []): THREE.Group[] {
    object.updateWorldMatrix(true, true)
    const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3())
    this.space.worldToLocal(center)
    center.add(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.9,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.9,
      ),
    )
    const sources = [...new Set([...this.parts(object), ...extra])]
    const created: THREE.Group[] = []
    this.prepare(object)
    for (const node of extra) {
      node.updateWorldMatrix(true, true)
      if (!this.prepared.has(node) && !this.originals.has(node)) {
        const clone = node.clone(true)
        clone.traverse((child) => {
          if (child instanceof THREE.Mesh)
            child.material = Array.isArray(child.material)
              ? child.material.map((m) => m.clone())
              : child.material.clone()
        })
        this.prepared.set(node, clone)
      }
    }
    for (const source of sources) {
      if (this.originals.has(source)) continue
      const mesh = this.prepared.get(source)!
      mesh.removeFromParent()
      this.prepared.delete(source)
      const materials: (typeof this.pieces)[number]['materials'] = []
      mesh.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return
        for (const material of Array.isArray(node.material) ? node.material : [node.material])
          if (
            material instanceof THREE.MeshStandardMaterial ||
            material instanceof THREE.MeshBasicMaterial
          )
            materials.push({ material, color: material.color.clone() })
      })
      const matrix = new THREE.Matrix4()
        .copy(this.space.matrixWorld)
        .invert()
        .multiply(source.matrixWorld)
      matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
      const pivot = new THREE.Group()
      pivot.name = source.name || 'Wreck component'
      const bounds = new THREE.Box3().setFromObject(mesh)
      const localCenter = bounds.getCenter(new THREE.Vector3())
      const halfSize = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5)
      pivot.position.copy(localCenter)
      mesh.position.sub(localCenter)
      pivot.add(mesh)
      this.root.add(pivot)
      const velocity = localCenter.clone().sub(center)
      if (velocity.lengthSq() < 0.01)
        velocity.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      velocity.normalize().multiplyScalar(4 + Math.random() * 5)
      velocity.x += (Math.random() - 0.5) * 1.5
      velocity.z += (Math.random() - 0.5) * 1.5
      velocity.y += 1.5 + Math.random() * 1.5
      const sizes = halfSize.toArray()
      const thin = sizes.indexOf(Math.min(...sizes))
      const axle = new THREE.Vector3().setComponent(thin, 1)
      const radius = Math.max(0.05, ...sizes.filter((_, i) => i !== thin))
      this.pieces.push({
        axle,
        radius,
        width: sizes[thin],
        resting: false,
        rolling: false,
        entityId,
        halfSize,
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
      if (!piece.resting) {
        if (!piece.rolling) {
          pivot.rotateX(piece.spin.x * dt)
          pivot.rotateY(piece.spin.y * dt)
          pivot.rotateZ(piece.spin.z * dt)
        }
        piece.rolling = false
        const support = (normal: THREE.Vector3) => {
          const axle = piece.axle.clone().applyQuaternion(pivot.quaternion)
          const along = Math.min(1, Math.abs(normal.dot(axle)))
          return (
            piece.width * along + piece.radius * Math.sqrt(Math.max(0, 1 - along * along)) + 0.015
          )
        }
        velocity.y -= 9.8 * dt
        const step = velocity.clone().multiplyScalar(dt),
          distance = step.length()
        const direction = step.clone().normalize()
        const hit =
          distance > 0 && cast
            ? cast(pivot.position, direction, distance + support(direction), piece.entityId)
            : null
        const resolve = (contact: { point: THREE.Vector3; normal: THREE.Vector3 }) => {
          pivot.position
            .copy(contact.point)
            .addScaledVector(contact.normal, support(contact.normal))
          const inward = velocity.dot(contact.normal)
          if (inward < 0) velocity.addScaledVector(contact.normal, -1.3 * inward)
          if (contact.normal.y > 0.5 && Math.abs(inward) < 2) {
            velocity.addScaledVector(contact.normal, -velocity.dot(contact.normal))
            velocity.multiplyScalar(
              Math.max(
                0,
                1 - (explosionTuning.debrisDrag * dt) / Math.max(0.001, velocity.length()),
              ),
            )
            const speed = velocity.length()
            if (speed > explosionTuning.debrisSleepSpeed) {
              const axle = contact.normal.clone().cross(velocity).normalize()
              const current = piece.axle.clone().applyQuaternion(pivot.quaternion)
              pivot.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(current, axle))
              pivot.quaternion.premultiply(
                new THREE.Quaternion().setFromAxisAngle(axle, (speed * dt) / piece.radius),
              )
            } else {
              velocity.set(0, 0, 0)
              piece.resting = true
            }
            piece.spin.set(0, 0, 0)
            piece.rolling = true
            pivot.position
              .copy(contact.point)
              .addScaledVector(contact.normal, support(contact.normal))
          } else {
            velocity.multiplyScalar(0.65)
            piece.spin.multiplyScalar(0.55)
          }
        }
        if (hit) resolve(hit)
        else pivot.position.add(step)
        // Rotation can lower a corner even when the centre has barely moved.
        const down = new THREE.Vector3(0, -1, 0)
        const ground = cast?.(pivot.position, down, support(down), piece.entityId)
        if (ground) resolve(ground)
      }
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
    for (const clone of this.prepared.values())
      clone.traverse((node) => {
        if (node instanceof THREE.Mesh)
          for (const material of Array.isArray(node.material) ? node.material : [node.material])
            material.dispose()
      })
    this.prepared.clear()
    this.root.removeFromParent()
  }
}
