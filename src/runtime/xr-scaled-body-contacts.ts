import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js'
import type { RigidBody } from '@dimforge/rapier3d-compat'
import type { World } from '../simulation/physics.js'
import type { EntityCollisionPart } from '../simulation/simulation.js'

type Part = {
  body: RigidBody
  signature: string
  from: THREE.Vector3
  target: THREE.Vector3
  rotation: THREE.Quaternion
  targetRotation: THREE.Quaternion
  elapsed: number
  duration: number
}
/** Kinematic contact mirrors of Engine's physical vehicle shapes in room metres.
 * Vehicle simulation remains authoritative. Shared Rapier solves the resulting
 * contacts with every dynamic prop; no per-ball or per-weapon shove code is used.
 */
export class XRScaledBodyContacts {
  private world: World | null = null
  private parts = new Map<string, Part>()
  constructor(private readonly getWorld: () => World | null) {}
  sync(parts: readonly EntityCollisionPart[], scale: number, dt: number): void {
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Invalid contact scale')
    const world = this.getWorld()
    if (world !== this.world) {
      this.clear()
      this.world = world
    }
    if (!world) return
    const live = new Set<string>()
    for (const source of parts) {
      const position = new THREE.Vector3(...source.transform.position).multiplyScalar(scale)
      const rotation = new THREE.Quaternion(...source.transform.rotation).normalize()
      if (![...position.toArray(), ...rotation.toArray()].every(Number.isFinite)) continue
      const key = source.key,
        signature = JSON.stringify([source.shape, scale])
      let part = this.parts.get(key)
      if (part && signature !== part.signature) {
        world.raw.removeRigidBody(part.body)
        this.parts.delete(key)
        part = undefined
      }
      if (!part) {
        const body = world.raw.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(position.x, position.y, position.z)
            .setRotation(rotation)
            .setCcdEnabled(true),
        )
        const shape = source.shape
        const descriptor =
          shape.kind === 'box'
            ? RAPIER.ColliderDesc.cuboid(
                shape.halfExtents[0] * scale,
                shape.halfExtents[1] * scale,
                shape.halfExtents[2] * scale,
              )
            : RAPIER.ColliderDesc.ball(shape.radius * scale)
        world.raw.createCollider(
          descriptor.setFriction(source.friction).setRestitution(source.restitution),
          body,
        )
        part = {
          body,
          signature,
          from: position.clone(),
          target: position.clone(),
          rotation: rotation.clone(),
          targetRotation: rotation.clone(),
          elapsed: 0,
          duration: 0,
        }
        this.parts.set(key, part)
      }
      live.add(key)
      part.from.copy(part.body.translation())
      part.rotation.copy(part.body.rotation())
      // Recovery and teleports are placement changes, not high-speed impacts.
      if (
        part.from.distanceTo(position) >
        Math.max(
          0.2,
          100 * scale * (Number.isFinite(dt) ? Math.max(1 / 90, Math.min(dt, 0.05)) : 1 / 90),
        )
      ) {
        part.body.setTranslation(position, true)
        part.body.setRotation(rotation, true)
        part.from.copy(position)
        part.rotation.copy(rotation)
      }
      part.target.copy(position)
      part.targetRotation.copy(rotation)
      part.elapsed = 0
      part.duration = Number.isFinite(dt) ? Math.max(1 / 90, Math.min(dt, 0.05)) : 1 / 90
    }
    for (const [key, part] of this.parts)
      if (!live.has(key)) {
        world.raw.removeRigidBody(part.body)
        this.parts.delete(key)
      }
  }
  beforeStep(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return
    for (const part of this.parts.values()) {
      part.elapsed += dt
      const t = part.duration > 0 ? Math.min(1, part.elapsed / part.duration) : 1
      part.body.setNextKinematicTranslation(part.from.clone().lerp(part.target, t))
      part.body.setNextKinematicRotation(part.rotation.clone().slerp(part.targetRotation, t))
    }
  }
  clear(): void {
    for (const part of this.parts.values()) this.world?.raw.removeRigidBody(part.body)
    this.parts.clear()
  }
}
