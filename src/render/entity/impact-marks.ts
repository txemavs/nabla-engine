import * as THREE from 'three'
import type { Transform, Vec3Tuple } from '../../entity/schema.js'

/** Most shot marks kept alive at once; the oldest is recycled past this. */
export const MAX_IMPACT_MARKS = 96
/** Distance a mark stands off the hit surface along its normal, metres (keeps it out of z-fighting). */
export const IMPACT_MARK_STANDOFF = 0.012

/**
 * Bounded shot marks. Entity hits parent into the hit object's local frame so they
 * ride with vehicles; world hits (buildings and other static colliders without an
 * entity id) parent under a scene root that shares the floating-origin shift.
 */
export class ImpactMarks {
  private readonly coreGeom = new THREE.CircleGeometry(0.04, 14)
  private readonly ringGeom = new THREE.RingGeometry(0.04, 0.085, 18)
  private readonly coreMat = new THREE.MeshBasicMaterial({
    color: '#141414',
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  private readonly ringMat = new THREE.MeshBasicMaterial({
    color: '#d8d2c4',
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  })
  private marks: THREE.Group[] = []
  get count(): number {
    return this.marks.length
  }

  private take(): THREE.Group {
    if (this.marks.length >= MAX_IMPACT_MARKS) {
      const oldest = this.marks.shift()!
      oldest.removeFromParent()
      return oldest
    }
    const group = new THREE.Group()
    group.name = 'shot-impact'
    const core = new THREE.Mesh(this.coreGeom, this.coreMat)
    const ring = new THREE.Mesh(this.ringGeom, this.ringMat)
    core.renderOrder = 2
    ring.renderOrder = 2
    group.add(core, ring)
    return group
  }

  private place(mark: THREE.Group, point: Vec3Tuple, normal: Vec3Tuple, local: boolean): void {
    const n = new THREE.Vector3(...normal).normalize()
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0)
    mark.position.fromArray(point).addScaledVector(n, IMPACT_MARK_STANDOFF)
    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
    // Slight random roll so overlapping marks do not stack identically.
    mark.rotateZ(Math.random() * Math.PI * 2)
    void local
  }

  /** Mark on a scene entity (car, prop, authored mesh) in that entity's local frame. */
  add(parent: THREE.Object3D, pose: Transform, point: Vec3Tuple, normal: Vec3Tuple): void {
    const mark = this.take()
    mark.removeFromParent()
    const inverse = new THREE.Quaternion(...pose.rotation).invert()
    const n = new THREE.Vector3(...normal).normalize().applyQuaternion(inverse)
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0)
    mark.position
      .fromArray(point)
      .sub(new THREE.Vector3(...pose.position))
      .applyQuaternion(inverse)
      .addScaledVector(n, IMPACT_MARK_STANDOFF)
    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
    mark.rotateZ(Math.random() * Math.PI * 2)
    parent.add(mark)
    this.marks.push(mark)
  }

  /**
   * Mark on static world geometry (planet buildings, ground colliders, …).
   * `root` must share the floating-origin shift with the hit meshes (e.g. `SceneView.root`
   * or `PlanetWorld.root`).
   */
  addWorld(root: THREE.Object3D, point: Vec3Tuple, normal: Vec3Tuple): void {
    const mark = this.take()
    mark.removeFromParent()
    this.place(mark, point, normal, false)
    root.add(mark)
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
    this.coreGeom.dispose()
    this.ringGeom.dispose()
    this.coreMat.dispose()
    this.ringMat.dispose()
  }
}
