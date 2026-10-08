/**
 * Spent magazines on the ground. Motion and despawn belong to `CasingMotion`; this only draws
 * clones of the pistol's `Magazine` node. Geometry and materials stay shared with the viewmodel,
 * so disposing a clone must not dispose them.
 */
import * as THREE from 'three'
import type { CasingPose } from '../../simulation/weapons/casings.js'

export class DroppedMagazines {
  readonly root = new THREE.Group()
  private readonly pool: THREE.Object3D[] = []
  private disposed = false

  constructor(template: THREE.Object3D, count = 8) {
    for (let i = 0; i < count; i++) {
      const mesh = template.clone(true)
      mesh.visible = false
      mesh.traverse((child) => {
        child.castShadow = false
        child.frustumCulled = false
      })
      this.root.add(mesh)
      this.pool.push(mesh)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.root.clear()
  }

  sync(poses: readonly CasingPose[]): void {
    if (this.disposed) return
    const shown = poses.slice(-this.pool.length)
    for (let i = 0; i < this.pool.length; i++) {
      const mesh = this.pool[i]
      const pose = shown[i]
      mesh.visible = !!pose
      if (!pose) continue
      mesh.position.fromArray(pose.position)
      const orientation = pose.orientation ?? [0, 0, 0, 1]
      mesh.quaternion.set(orientation[0], orientation[1], orientation[2], orientation[3])
      const axis = new THREE.Vector3(...pose.spin)
      if (axis.lengthSq() > 1e-8)
        mesh.quaternion.multiply(
          new THREE.Quaternion().setFromAxisAngle(axis.normalize(), pose.angle),
        )
    }
  }
}
