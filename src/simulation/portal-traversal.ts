/** Stateful portal transfer, lock release and velocity/frame preservation. */
import { Quaternion as RenderQuaternion, Vector3 } from 'three'
import { Body, Quaternion, Vec3, type World } from './physics.js'
import { portalLocal, portalMapping } from '../entity/portal/portal.js'
import { portalEnvelope } from './portal-clearance.js'
import type { Entity, Transform, Vec3Tuple } from '../entity/schema.js'
import type { Vehicle } from '../entity/vehicle/vehicle.js'
import type { PlayerInput } from './contracts.js'
const vec = (v: Vec3): Vec3Tuple => [v.x, v.y, v.z]
export interface PortalTransferEvent {
  sequence: number
  actorId: string
  sourceId: string
  destinationId: string
  yawDelta: number
  blocked: boolean
}
/** Explicit simulation services; no back-reference to the owning Simulation class. */
export interface PortalTransferContext {
  portals: readonly Entity[]
  bodies: ReadonlyMap<string, Body>
  vehicles: ReadonlyMap<string, Vehicle>
  world: World
  playerBody: Body
  input: PlayerInput
  activeVehicle: string | null
  transform(id: string): Transform
  interiorBody(): Body | null
  setInteriorId(id: string | null): void
  isDocked(id: string): boolean
  exitBlocked(
    body: Body,
    position: Vector3,
    quaternion: RenderQuaternion,
    destination: Entity,
  ): boolean
  refreshCollisions(): void
  clearWheelHistory(id: string): void
}
export class PortalTraversal {
  private readonly portalLocks = new Map<number, string>()
  private portalSequence = 0
  private lastPortalEvent: PortalTransferEvent | null = null
  /** Return a copy of the latest transfer; sequence distinguishes repeated crossings. */
  get event(): PortalTransferEvent | null {
    return this.lastPortalEvent ? { ...this.lastPortalEvent } : null
  }
  /** Resolve swept crossings after a physics tick, preserving relative velocity at moving portals. */
  cross(
    previous: { body: Body; position: Vec3Tuple }[],
    beforeMouths: Map<string, Transform>,
    context: PortalTransferContext,
  ): void {
    const mouths = context.portals
      .filter((e) => e.portal!.mode === 'open')
      .map((e) => ({ ...e, transform: context.transform(e.id) }))
    if (!mouths.length) return
    for (const { body, position } of previous) {
      const actor = [...context.bodies].find(([, b]) => b === body)?.[0] ?? 'player'
      const vehicle = context.vehicles.get(actor)
      const corners = portalEnvelope(body, vehicle)
      const lock = this.portalLocks.get(body.id)
      if (lock) {
        const mouth = mouths.find((e) => e.id === lock)
        if (mouth && corners.some((c) => Math.abs(portalLocal(c, mouth.transform).z) < 0.25))
          continue
        // Keep the lock until the entire body has cleared the exit plane.
        if (mouth) {
          const zs = corners.map((c) => portalLocal(c, mouth.transform).z)
          if (Math.min(...zs) <= 0.15 && Math.max(...zs) >= -0.15) continue
        }
        this.portalLocks.delete(body.id)
      }
      for (const source of mouths) {
        if (source.id === lock || source.parentId === actor) continue
        const a = portalLocal(position, beforeMouths.get(source.id)!),
          b = portalLocal(vec(body.position), source.transform)
        const crossing = a.z > 0 && b.z <= 0 ? a.z / (a.z - b.z) : null
        const backwards = a.z < 0 && b.z >= 0
        if (crossing === null && !backwards) continue
        const fraction = crossing ?? -a.z / (b.z - a.z)
        const centre = new Vector3(...position).lerp(new Vector3(...vec(body.position)), fraction)
        const local = portalLocal(centre.toArray(), source.transform)
        if (
          Math.abs(local.x) > source.size[0] / 2 + 5 ||
          Math.abs(local.y) > source.size[1] / 2 + 5
        )
          continue
        const shift = centre.sub(new Vector3(...vec(body.position)))
        const fits = corners.every((c) => {
          const p = portalLocal(new Vector3(...c).add(shift).toArray(), source.transform)
          return (
            Math.abs(p.x) < source.size[0] / 2 - 0.025 && Math.abs(p.y) < source.size[1] / 2 + 0.025
          )
        })
        // A near miss outside the frame must remain ordinary movement.
        const projected = corners.map((c) =>
          portalLocal(new Vector3(...c).add(shift).toArray(), source.transform),
        )
        if (
          Math.min(...projected.map((p) => p.x)) > source.size[0] / 2 ||
          Math.max(...projected.map((p) => p.x)) < -source.size[0] / 2 ||
          Math.min(...projected.map((p) => p.y)) > source.size[1] / 2 ||
          Math.max(...projected.map((p) => p.y)) < -source.size[1] / 2
        )
          continue
        const destination = mouths.find((e) => e.id === source.portal!.pairId)!
        const mapping = portalMapping(source.transform, destination.transform)
        const rotation = new RenderQuaternion().setFromRotationMatrix(mapping)
        const mappedPosition = new Vector3(...vec(body.position)).applyMatrix4(mapping)
        const mappedRotation = rotation
          .clone()
          .multiply(
            new RenderQuaternion(
              body.quaternion.x,
              body.quaternion.y,
              body.quaternion.z,
              body.quaternion.w,
            ),
          )
        const constrained = context.isDocked(actor)
        const blocked =
          backwards ||
          !fits ||
          constrained ||
          destination.parentId === actor ||
          context.exitBlocked(body, mappedPosition, mappedRotation, destination)
        if (blocked) {
          body.position.set(...position)
          body.velocity.setZero()
          body.angularVelocity.setZero()
        } else {
          const sourceHost = context.bodies.get(source.parentId ?? '')
          const destinationHost = context.bodies.get(destination.parentId ?? '')
          const sourceVelocity = new Vec3(),
            destinationVelocity = new Vec3()
          sourceHost?.getVelocityAtWorldPoint(body.position, sourceVelocity)
          destinationHost?.getVelocityAtWorldPoint(
            new Vec3(...mappedPosition.toArray()),
            destinationVelocity,
          )
          body.velocity.vsub(sourceVelocity, body.velocity)
          if (sourceHost)
            body.angularVelocity.vsub(sourceHost.angularVelocity, body.angularVelocity)
          body.position.set(...mappedPosition.toArray())
          body.quaternion.set(...mappedRotation.toArray())
          body.velocity.set(
            ...new Vector3(...vec(body.velocity)).applyQuaternion(rotation).toArray(),
          )
          body.angularVelocity.set(
            ...new Vector3(...vec(body.angularVelocity)).applyQuaternion(rotation).toArray(),
          )
          body.velocity.vadd(destinationVelocity, body.velocity)
          if (destinationHost)
            body.angularVelocity.vadd(destinationHost.angularVelocity, body.angularVelocity)
          context.refreshCollisions()
          this.portalLocks.set(body.id, destination.id)
          // A solved contact belongs to the old location; do not expose it at the exit.
          context.world.contacts = context.world.contacts.filter(
            (c) => c.bi !== body && c.bj !== body,
          )
          if (vehicle) {
            context.clearWheelHistory(actor)
            vehicle.raycast.wheelInfos.forEach((w) => {
              w.isInContact = false
              w.raycastResult.reset()
            })
            if (vehicle.flight) vehicle.flight = null
          }
        }
        body.previousPosition.copy(body.position)
        body.interpolatedPosition.copy(body.position)
        body.previousQuaternion.copy(body.quaternion)
        body.aabbNeedsUpdate = true
        body.wakeUp()
        const forward = new Vector3(0, 0, -1).applyQuaternion(rotation)
        const yawDelta = blocked ? 0 : Math.atan2(-forward.x, -forward.z)
        if (body === context.playerBody && !blocked) {
          const old = context.interiorBody()?.quaternion ?? new Quaternion()
          const look = new Vector3(-Math.sin(context.input.yaw), 0, -Math.cos(context.input.yaw))
            .applyQuaternion(new RenderQuaternion(old.x, old.y, old.z, old.w))
            .applyQuaternion(rotation)
          context.setInteriorId(destination.parentId)
          const next = context.interiorBody()?.quaternion ?? new Quaternion()
          look.applyQuaternion(new RenderQuaternion(next.x, next.y, next.z, next.w).invert())
          context.input.yaw = Math.atan2(-look.x, -look.z)
          context.playerBody.quaternion.copy(next)
        } else if (actor === context.activeVehicle) context.input.yaw += yawDelta
        this.lastPortalEvent = {
          sequence: ++this.portalSequence,
          actorId: actor,
          sourceId: source.id,
          destinationId: destination.id,
          yawDelta,
          blocked,
        }
        break
      }
    }
  }
  /** Release locks and events at terminal simulation disposal. */
  clear(): void {
    this.portalLocks.clear()
    this.lastPortalEvent = null
  }
}
