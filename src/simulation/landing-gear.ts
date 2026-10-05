import { Box, Quaternion, Vec3, type Body } from './physics.js'
import type { VehicleDefinition } from '../entity/vehicle/field.js'
import type { Vec3Tuple } from '../entity/schema.js'

/** Stock fifth-wheel trailer: Stützbein sits ~3.19 m behind the kingpin. */
const GEAR_BEHIND_KINGPIN = 3.19
const FOOT_HALF_TRACK = 0.72
const FOOT_SIZE: Vec3Tuple = [0.16, 0.4, 0.16]

export interface LandingGearFoot {
  size: Vec3Tuple
  position: Vec3Tuple
}

/** Wheel-contact plane in chassis space (hub centre minus tyre radius). */
export function trailerWheelContactY(definition: VehicleDefinition): number {
  return Math.min(...definition.hubs.map((hub) => hub[1] - definition.wheelRadius))
}

/** True for a passive trailer that can rest on landing legs. */
export function hasLandingGear(definition: VehicleDefinition): boolean {
  return Boolean(definition.passive && definition.towAnchor)
}

/**
 * Two chassis-local feet under the authored Stützbein. Bottoms sit on the same
 * plane as the tyres so a free trailer stays level instead of pitching onto the kingpin.
 */
export function landingGearFeet(definition: VehicleDefinition): LandingGearFoot[] {
  if (!hasLandingGear(definition) || !definition.towAnchor) return []
  const contactY = trailerWheelContactY(definition)
  const height = FOOT_SIZE[1]
  const z = definition.towAnchor[2] + GEAR_BEHIND_KINGPIN
  const y = contactY + height / 2
  return [-FOOT_HALF_TRACK, FOOT_HALF_TRACK].map((x) => ({
    size: [...FOOT_SIZE] as Vec3Tuple,
    position: [x, y, z],
  }))
}

/** How far the visual Stützbein group must drop so its authored foot reaches the tyre plane. */
export function landingGearDeployOffset(visualMinY: number, contactY: number): number {
  return contactY - visualMinY
}

export function addLandingGearShapes(body: Body, definition: VehicleDefinition): Box[] {
  const shapes: Box[] = []
  for (const foot of landingGearFeet(definition)) {
    const shape = new Box(new Vec3(foot.size[0] / 2, foot.size[1] / 2, foot.size[2] / 2))
    body.addShape(shape, new Vec3(...foot.position), new Quaternion(0, 0, 0, 1))
    shapes.push(shape)
  }
  return shapes
}

export function removeLandingGearShapes(body: Body, shapes: readonly Box[]): void {
  for (const shape of shapes) body.removeShape(shape)
}
