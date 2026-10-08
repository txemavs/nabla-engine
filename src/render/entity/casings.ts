/**
 * Ejected brass: a small pool of meshes drawing the poses of `CasingMotion` (which owns the
 * motion and the despawn). 9x19 case: 19.15 mm long, 9.96 mm rim.
 */
import * as THREE from 'three'
import type { CasingPose } from '../../simulation/weapons/casings.js'

const POOL = 24

export class Casings {
  readonly root = new THREE.Group()
  private readonly pool: THREE.Mesh[] = []
  private disposed = false

  constructor(length: number, diameter: number) {
    const geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, length, 6)
    const material = new THREE.MeshStandardMaterial({
      color: '#c9a45b',
      metalness: 1,
      roughness: 0.35,
    })
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.visible = false
      mesh.castShadow = false
      this.root.add(mesh)
      this.pool.push(mesh)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const mesh = this.pool[0]
    mesh?.geometry.dispose()
    ;(mesh?.material as THREE.Material | undefined)?.dispose()
    this.root.clear()
  }

  /** Draw the live casings (at most the pool size; the newest win). */
  sync(poses: readonly CasingPose[]): void {
    if (this.disposed) return
    const shown = poses.slice(-this.pool.length)
    for (let i = 0; i < this.pool.length; i++) {
      const mesh = this.pool[i],
        pose = shown[i]
      mesh.visible = !!pose
      if (!pose) continue
      mesh.position.fromArray(pose.position)
      const axis = new THREE.Vector3(...pose.spin)
      if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0)
      mesh.quaternion.setFromAxisAngle(axis.normalize(), pose.angle)
    }
  }
}
