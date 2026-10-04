import { Body, RaycastVehicle, Vec3 } from '../../physics.js'
import type {
  TrailerDefinition,
  TrailerInput,
  TrailerWheelSnapshot,
  WheelVector,
} from './contracts.js'

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

/** Passive trailer rig in the host's single world; this module never steps or owns that world. */
export interface Trailer {
  body: Body
  raycast: RaycastVehicle
  definition: TrailerDefinition
}

/** Create a passive trailer rig around a supplied body. Host attaches it with raycast.addToWorld(world). */
export function createTrailer(body: Body, definition: TrailerDefinition): Trailer {
  const positive = (value: number) => Number.isFinite(value) && value > 0
  if (
    !positive(body.mass) ||
    !definition.axles.length ||
    !definition.axles.every(
      (axle) =>
        axle.hubs.length >= 1 &&
        axle.hubs.every((hub) => hub.length === 3 && hub.every(Number.isFinite)) &&
        positive(axle.wheelRadius),
    ) ||
    ![
      definition.suspensionRest,
      definition.stiffness,
      definition.brakeForce,
      definition.suspensionTravel ?? 0.3,
    ].every(positive) ||
    definition.kingpin.length !== 3 ||
    !definition.kingpin.every(Number.isFinite)
  )
    throw new Error('Invalid trailer definition')

  const trailer = new RaycastVehicle({
    chassisBody: body,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2,
  })

  for (const axle of definition.axles) {
    for (const [x, y, z] of axle.hubs) {
      trailer.addWheel({
        chassisConnectionPointLocal: new Vec3(x, y + definition.suspensionRest, z),
        directionLocal: new Vec3(0, -1, 0),
        axleLocal: new Vec3(1, 0, 0),
        radius: axle.wheelRadius,
        suspensionRestLength: definition.suspensionRest,
        suspensionStiffness: definition.stiffness,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        frictionSlip: 4.5,
        rollInfluence: 0.04,
        maxSuspensionForce: 100000,
        maxSuspensionTravel: definition.suspensionTravel ?? 0.3,
      })
    }
  }

  return { body, raycast: trailer, definition }
}

/** Apply one fixed tick of brake forces; call before the shared world's step. */
export function stepTrailer(trailer: Trailer, input: TrailerInput, dt: number): void {
  if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(input.brake) || input.brake < 0)
    throw new Error('Expected finite nonnegative tick and valid trailer input')
  if (dt === 0) return

  const brakeCommand = clamp(input.brake, 0, 1)
  const parkingForce = input.parkingBrake ? trailer.definition.brakeForce : 0
  const serviceForce = brakeCommand * trailer.definition.brakeForce

  const numWheels = trailer.raycast.wheelInfos.length
  for (let i = 0; i < numWheels; i++) {
    trailer.raycast.setSteeringValue(0, i)
    trailer.raycast.applyEngineForce(0, i)
    trailer.raycast.setBrake(Math.max(serviceForce, parkingForce), i)
  }
}

const tuple = (v: Vec3): WheelVector => [v.x, v.y, v.z]

/** Get wheel contact snapshots for rendering. */
export function trailerWheelContacts(trailer: Trailer): TrailerWheelSnapshot[] {
  return trailer.raycast.wheelInfos.map((wheel) => {
    const normal = wheel.raycastResult.hitNormalWorld
    const length = normal.length()
    const point = tuple(wheel.raycastResult.hitPointWorld)
    const contact =
      wheel.isInContact && Number.isFinite(length) && length > 1e-8 && point.every(Number.isFinite)
    return {
      wheelCenter: tuple(wheel.worldTransform.position),
      contactPoint: contact ? point : null,
      contactNormal: contact ? [normal.x / length, normal.y / length, normal.z / length] : null,
      suspensionLength: wheel.suspensionLength,
      isInContact: contact,
    }
  })
}
