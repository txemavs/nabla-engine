import * as THREE from 'three'
import { Vec3, Body, Box, type World } from '../simulation/physics.js'

/** Tracking adapter over the engine's Rapier scene. Inventory/render meshes are never colliders. */
export class XRItemContacts {
  private previous = new WeakMap<
    THREE.Object3D,
    { actual: THREE.Vector3[]; desired: THREE.Vector3[]; time: number }
  >()
  private corrections = new WeakMap<THREE.Object3D, THREE.Vector3>()
  private touching = new WeakMap<THREE.Object3D, Map<number, number>>()
  private dropped = new Map<THREE.Object3D, { body: Body; world: World }>()
  private lastSound = -Infinity
  drop(
    root: THREE.Object3D,
    velocity: THREE.Vector3,
    world: World | null,
    angularVelocity = new THREE.Vector3(),
  ): boolean {
    if (!world) return false
    let entry = this.dropped.get(root)
    if (entry && entry.world !== world) {
      entry.world.removeBody(entry.body)
      this.dropped.delete(root)
      entry = undefined
    }
    if (!entry) {
      root.updateWorldMatrix(true, true)
      const inverse = root.matrixWorld.clone().invert(),
        bounds = new THREE.Box3()
      root.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.geometry.computeBoundingBox()
        if (mesh.geometry.boundingBox)
          bounds.union(
            mesh.geometry.boundingBox
              .clone()
              .applyMatrix4(inverse.clone().multiply(node.matrixWorld)),
          )
      })
      if (bounds.isEmpty()) return false
      const size = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5)
      const centre = bounds.getCenter(new THREE.Vector3())
      const p = root.getWorldPosition(new THREE.Vector3()),
        q = root.getWorldQuaternion(new THREE.Quaternion())
      const body = new Body({ mass: 0.2, linearDamping: 0.1, angularDamping: 0.2 })
      body.addShape(
        new Box(
          new Vec3(Math.max(size.x, 0.005), Math.max(size.y, 0.005), Math.max(size.z, 0.005)),
        ),
        new Vec3(centre.x, centre.y, centre.z),
      )
      body.position.set(p.x, p.y, p.z)
      body.quaternion.set(q.x, q.y, q.z, q.w)
      body.velocity.set(velocity.x, velocity.y, velocity.z)
      body.angularVelocity.set(angularVelocity.x, angularVelocity.y, angularVelocity.z)
      world.addBody(body)
      body.raw!.enableCcd(true)
      entry = { body, world }
      this.dropped.set(root, entry)
    }
    const body = entry.body
    const p = new THREE.Vector3(body.position.x, body.position.y, body.position.z)
    const q = new THREE.Quaternion(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w,
    )
    root.position.copy(root.parent ? root.parent.worldToLocal(p) : p)
    if (root.parent) q.premultiply(root.parent.getWorldQuaternion(new THREE.Quaternion()).invert())
    root.quaternion.copy(q)
    velocity.set(body.velocity.x, body.velocity.y, body.velocity.z)
    return true
  }
  retainDropped(roots: readonly THREE.Object3D[]): void {
    for (const [root, entry] of this.dropped)
      if (!roots.includes(root)) {
        entry.world.removeBody(entry.body)
        this.dropped.delete(root)
      }
  }
  dispose(): void {
    this.retainDropped([])
  }

  onContact?: (point: THREE.Vector3) => void
  resolve(root: THREE.Object3D, points: THREE.Vector3[], world: World | null, now: number): void {
    const old = this.previous.get(root)
    const correction = new THREE.Vector3()
    const elapsed = old ? (now - old.time) / 1000 : 0
    const contacts = this.touching.get(root) ?? new Map<number, number>()
    if (world && old?.actual.length === points.length && elapsed > 0 && elapsed < 0.1) {
      for (let i = 0; i < points.length; i++) {
        const from = old.actual[i],
          to = points[i]
        const travel = to.clone().sub(from)
        if (travel.length() > 0.3) continue // Tracking reacquisition is not an impact.
        const hit = world.sweepSphere(
          new Vec3(from.x, from.y, from.z),
          new Vec3(to.x, to.y, to.z),
          0.015,
        )
        if (!hit) continue
        const offset = travel.multiplyScalar(-(1 - hit.fraction))
        if (offset.lengthSq() > correction.lengthSq()) correction.copy(offset)
        const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z)
        const approach = -to.clone().sub(old.desired[i]).divideScalar(elapsed).dot(normal)
        const newContact = now - (contacts.get(hit.collider) ?? -Infinity) > 200
        contacts.set(hit.collider, now)
        if (newContact && approach > 0.6 && now - this.lastSound > 600) {
          this.lastSound = now
          this.onContact?.(new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z))
        }
      }
    }
    for (const [id, time] of contacts) if (now - time > 1000) contacts.delete(id)
    this.touching.set(root, contacts)
    this.corrections.set(root, correction)
    this.apply(root)
    this.previous.set(root, {
      actual: points.map((p) => p.clone().add(correction)),
      desired: points.map((p) => p.clone()),
      time: now,
    })
  }
  /** Reapply after recoil posing without running collision/audio twice in one frame. */
  apply(root: THREE.Object3D): void {
    const correction = this.corrections.get(root)
    if (!root.parent || !correction?.lengthSq()) return
    const point = root.getWorldPosition(new THREE.Vector3()).add(correction)
    root.position.copy(root.parent.worldToLocal(point))
    root.updateWorldMatrix(true, true)
  }
  forget(root: THREE.Object3D): void {
    this.previous.delete(root)
    this.touching.delete(root)
    this.corrections.delete(root)
  }
}
