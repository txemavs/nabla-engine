import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Entity } from '../src/scene.js'
/** Render-only batches. Authored road entities stay intact for editing and export. */
export class RoadBatches {
  readonly root = new THREE.Group()
  private source: Entity[] | null = null
  private batches: { mesh: THREE.Mesh; bounds: THREE.Sphere }[] = []
  update(
    entities: Entity[],
    objects: Map<string, THREE.Group>,
    playing: boolean,
    eye: THREE.Vector3,
    distance: number,
  ): void {
    this.root.visible = playing
    if (!playing) return
    if (entities !== this.source) {
      this.clear()
      this.source = entities
      const buckets = new Map<string, { geometry: THREE.BufferGeometry[]; color: string }>()
      for (const e of entities) {
        if (!e.road || !e.source) continue
        const group = objects.get(e.id)!
        group.updateMatrix()
        for (const child of group.children) {
          if (!(child instanceof THREE.Mesh)) continue
          child.updateMatrix()
          const geometry = child.geometry
            .clone()
            .applyMatrix4(new THREE.Matrix4().multiplyMatrices(group.matrix, child.matrix))
          geometry.computeBoundingSphere()
          const p = geometry.boundingSphere!.center
          const key = `${Math.floor(p.x / 256)}:${Math.floor(p.z / 256)}:${e.color}`
          let bucket = buckets.get(key)
          if (!bucket) {
            bucket = { geometry: [], color: e.color }
            buckets.set(key, bucket)
          }
          bucket.geometry.push(geometry)
        }
      }
      for (const bucket of buckets.values()) {
        const geometry = mergeGeometries(bucket.geometry)!
        bucket.geometry.forEach((g) => g.dispose())
        geometry.computeBoundingSphere()
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: bucket.color,
            roughness: 0.85,
            side: THREE.DoubleSide,
          }),
        )
        mesh.receiveShadow = true
        mesh.matrixAutoUpdate = false
        this.root.add(mesh)
        this.batches.push({ mesh, bounds: geometry.boundingSphere! })
      }
    }
    for (const { mesh, bounds } of this.batches)
      mesh.visible =
        distance > 0 && bounds.center.distanceToSquared(eye) <= (distance + bounds.radius) ** 2
  }
  private clear(): void {
    for (const { mesh } of this.batches) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.root.clear()
    this.batches = []
  }
  dispose(): void {
    this.clear()
    this.root.removeFromParent()
  }
}
