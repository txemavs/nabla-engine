import { HingeConstraint, Vec3, type World } from './physics.js'
import type { Vehicle } from '../entity/vehicle/vehicle.js'
import type { Vec3Tuple } from '../entity/schema.js'

const HITCH_REACH = 2.4
const HITCH_ALIGN = 0.55
const HITCH_SPEED = 1.5

export type TrailerJoint = HingeConstraint

export function hitchWorldPoint(vehicle: Vehicle): Vec3 | null {
  const hitch = vehicle.definition.hitch
  if (!hitch) return null
  return vehicle.body.pointToWorldFrame(new Vec3(...hitch))
}

export function towAnchorWorldPoint(vehicle: Vehicle): Vec3 | null {
  const anchor = vehicle.definition.towAnchor
  if (!anchor) return null
  return vehicle.body.pointToWorldFrame(new Vec3(...anchor))
}

export function hitchSeparation(tractor: Vehicle, trailer: Vehicle): number | null {
  const hitch = hitchWorldPoint(tractor)
  const anchor = towAnchorWorldPoint(trailer)
  if (!hitch || !anchor) return null
  return hitch.distanceTo(anchor)
}

function forward(vehicle: Vehicle): Vec3 {
  return vehicle.body.quaternion.vmult(new Vec3(0, 0, -1))
}

/** Nearby free trailer whose kingpin can meet this tractor's fifth wheel. */
export function hitchCandidate(
  tractor: Vehicle,
  trailers: Iterable<Vehicle>,
  maxDistance = HITCH_REACH,
): Vehicle | null {
  if (!tractor.definition.hitch || tractor.definition.passive) return null
  if (tractor.body.velocity.length() > HITCH_SPEED) return null
  const hitch = hitchWorldPoint(tractor)
  if (!hitch) return null
  const tractorForward = forward(tractor)
  let nearest: Vehicle | null = null
  let distance = maxDistance
  for (const trailer of trailers) {
    if (trailer === tractor || !trailer.definition.passive || !trailer.definition.towAnchor)
      continue
    if (trailer.definition.tow) continue
    if (trailer.body.velocity.length() > HITCH_SPEED) continue
    const anchor = towAnchorWorldPoint(trailer)
    if (!anchor) continue
    const gap = hitch.distanceTo(anchor)
    if (gap >= distance) continue
    if (tractorForward.dot(forward(trailer)) < HITCH_ALIGN) continue
    nearest = trailer
    distance = gap
  }
  return nearest
}

export function trailerTowedBy(trailer: Vehicle, tractorId: string): boolean {
  return trailer.definition.tow?.vehicleId === tractorId
}

export function createTrailerJoint(tractor: Vehicle, trailer: Vehicle): TrailerJoint {
  const hitch = trailer.definition.tow?.hitch ?? tractor.definition.hitch
  const anchor = trailer.definition.tow?.anchor ?? trailer.definition.towAnchor
  if (!hitch || !anchor) throw new Error('Tractor and trailer need hitch and towAnchor')
  const joint = new HingeConstraint(
    tractor.body,
    trailer.body,
    new Vec3(...hitch),
    new Vec3(...anchor),
  )
  joint.collideConnected = true
  return joint
}

export function bindTrailerTow(tractor: Vehicle, trailer: Vehicle): void {
  const hitch = tractor.definition.hitch
  const anchor = trailer.definition.towAnchor
  if (!hitch || !anchor) throw new Error('Tractor and trailer need hitch and towAnchor')
  const tow = {
    vehicleId: tractor.entity.id,
    hitch: [...hitch] as Vec3Tuple,
    anchor: [...anchor] as Vec3Tuple,
  }
  trailer.definition.tow = tow
  if (trailer.entity.vehicle) trailer.entity.vehicle.tow = { ...tow }
}

export function clearTrailerTow(trailer: Vehicle): void {
  delete trailer.definition.tow
  if (trailer.entity.vehicle) delete trailer.entity.vehicle.tow
}

export function addTrailerJoint(world: World, joints: TrailerJoint[], joint: TrailerJoint): void {
  world.addConstraint(joint)
  joints.push(joint)
}

export function removeJointsFor(
  world: World,
  joints: TrailerJoint[],
  vehicle: Vehicle,
): TrailerJoint[] {
  const removed: TrailerJoint[] = []
  for (let i = joints.length - 1; i >= 0; i--) {
    const joint = joints[i]
    if (joint.bodyA !== vehicle.body && joint.bodyB !== vehicle.body) continue
    world.removeConstraint(joint)
    joints.splice(i, 1)
    removed.push(joint)
  }
  return removed
}
