import * as THREE from 'three'
import type { Transform, Vec3Tuple } from '../src/scene.js'

/** Bounded, surface-aligned shot marks, attached in the hit entity's local frame. */
export class ImpactMarks {
  private readonly geometry = new THREE.CircleGeometry(0.045, 12)
  private readonly material = new THREE.MeshBasicMaterial({
    color: '#080808',
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  private marks: THREE.Mesh[] = []
  get count(): number {
    return this.marks.length
  }
  add(parent: THREE.Object3D, pose: Transform, point: Vec3Tuple, normal: Vec3Tuple): void {
    const mark =
      this.marks.length >= 64 ? this.marks.shift()! : new THREE.Mesh(this.geometry, this.material)
    mark.removeFromParent()
    const inverse = new THREE.Quaternion(...pose.rotation).invert()
    const n = new THREE.Vector3(...normal).normalize().applyQuaternion(inverse)
    mark.position
      .fromArray(point)
      .sub(new THREE.Vector3(...pose.position))
      .applyQuaternion(inverse)
      .addScaledVector(n, 0.002)
    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
    mark.renderOrder = 1
    mark.name = 'shot-impact'
    parent.add(mark)
    this.marks.push(mark)
  }
  removeFor(parent: THREE.Object3D): void {
    this.marks = this.marks.filter((mark) => {
      let owner: THREE.Object3D | null = mark.parent
      while (owner && owner !== parent) owner = owner.parent
      if (!owner) return true
      mark.removeFromParent()
      return false
    })
  }
  clear(): void {
    for (const mark of this.marks) mark.removeFromParent()
    this.marks = []
  }
  dispose(): void {
    this.clear()
    this.geometry.dispose()
    this.material.dispose()
  }
}
