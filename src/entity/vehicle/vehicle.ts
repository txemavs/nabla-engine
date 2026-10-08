import type { DrivetrainState } from '../../simulation/vehicles/drivetrain.js'
import type { TwoWheeledState } from '../../simulation/vehicles/two-wheeled/contracts.js'
import type { Body, Box, RaycastVehicle } from '../../simulation/physics.js'
import type { Entity } from '../schema.js'
import type { VehicleDefinition } from './field.js'

/** Runtime chassis. The persisted payload stays on `entity.vehicle`. */
export interface Vehicle {
  body: Body
  raycast: RaycastVehicle
  entity: Entity
  steer: number
  /** Installed landing-leg colliders while a free trailer is unhitched. */
  landingGear: Box[]
  /** Outboard throttle, −1..1. Lags the stick so the hull carries speed. */
  drivetrain: DrivetrainState
  prop: number
  definition: VehicleDefinition
  flight: { altitude: number; yaw: number } | null
  rampClosed: boolean
  rampAngle: number
  rampTarget: number
  rampPortalActive: boolean
  cruiseSpeed: number
  helm: 'off' | 'auto' | 'car' | 'drone' | 'plane' | 'space'
  /** Lean controller state; present only on two-wheeled vehicles. */
  twoWheeled?: TwoWheeledState
}

/** True for a single-track vehicle (motorcycle) driven by the two-wheeled controller. */
export function isTwoWheeled(
  definition: Pick<VehicleDefinition, 'twoWheeled'> | null | undefined,
): boolean {
  return Boolean(definition?.twoWheeled)
}

/** Tyre radius of hub `index`: two-wheelers have their own rear radius; others share one. */
export function hubWheelRadius(
  definition: Pick<VehicleDefinition, 'twoWheeled' | 'wheelRadius'>,
  index: number,
): number {
  return definition.twoWheeled && index === 1
    ? definition.twoWheeled.rearWheelRadius
    : definition.wheelRadius
}

/** Lowest tyre contact below the chassis origin (hub centre minus its tyre radius), metres. */
export function wheelContactY(
  definition: Pick<VehicleDefinition, 'twoWheeled' | 'wheelRadius' | 'hubs'>,
): number {
  return Math.min(...definition.hubs.map((hub, i) => hub[1] - hubWheelRadius(definition, i)))
}

/** Minimum chassis size [width, height, length] in metres. Two-wheelers are narrow and short. */
const MIN_SIZE: Readonly<Record<'fourWheeled' | 'twoWheeled', readonly number[]>> = {
  fourWheeled: [1, 0.3, 2],
  twoWheeled: [0.3, 0.3, 1],
}

export function validateVehicle(entity: Entity): void {
  const spec = entity.vehicle
  if (spec) {
    if (spec.twoWheeled) {
      if (spec.hubs.length !== 2)
        throw new Error('Two-wheeled vehicles need exactly two hubs, front then rear')
      if (spec.passive || spec.tow || spec.flight || spec.plane || spec.boat || spec.garage)
        throw new Error('Two-wheeled vehicles cannot be trailers, aircraft, boats or carriers')
      if (!(spec.hubs[0][2] < spec.hubs[1][2]))
        throw new Error('The front hub must be ahead (more negative Z) of the rear hub')
      const tuning = spec.twoWheeled
      if (tuning.maxLean !== undefined && tuning.fallLean !== undefined)
        if (tuning.fallLean <= tuning.maxLean)
          throw new Error('Two-wheeled fall lean must exceed the maximum cornering lean')
    } else if (spec.hubs.length === 2)
      throw new Error('Two-hub rigs must declare vehicle.twoWheeled')
    else if (spec.hubs.length !== 4 && !spec.passive)
      throw new Error('Six-wheel rigs must be passive trailers')
    if (spec.tow && !spec.passive) throw new Error('Only passive trailers can be towed')
    if (entity.visual?.wheels && entity.visual.wheels.length !== spec.hubs.length)
      throw new Error('Wheel models must match the hubs')
    if (entity.visual?.wheelRotations && entity.visual.wheelRotations.length !== spec.hubs.length)
      throw new Error('Wheel rotations must match the hubs')
  }
  if (spec && entity.kind !== 'vehicle') throw new Error('Vehicle definition requires a vehicle')
  const ramp = spec?.garage?.ramp
  if (ramp && ramp.colliderIndex >= spec!.colliders.length)
    throw new Error('Ramp collider does not exist')
  const interior = spec?.interior
  if (
    interior &&
    (interior.min.some((n, i) => n >= interior.max[i]) ||
      interior.exit.some((n, i) => n < interior.min[i] || n > interior.max[i]))
  )
    throw new Error('Invalid interior bounds or exit')
  if (spec?.garage && spec.garage.min.some((v, i) => v >= spec.garage!.max[i]))
    throw new Error('Garage bounds are invalid')
  if (entity.kind !== 'vehicle') return
  if (entity.motion !== 'dynamic' || entity.parentId !== null)
    throw new Error('Vehicles must be dynamic roots')
  const minimum = MIN_SIZE[spec?.twoWheeled ? 'twoWheeled' : 'fourWheeled']
  if (entity.size.some((value, i) => value < minimum[i])) throw new Error('Vehicle is too small')
}

/** Defaults for procedural cars. Asset names are not physics configuration. */
export function vehicleDefinition(entity: Entity): VehicleDefinition {
  if (entity.vehicle) return entity.vehicle
  const halfTrack = entity.size[0] / 2,
    halfBase = entity.size[2] * 0.32
  const hubY = -entity.size[1] * 0.3 - 0.35
  return {
    colliders: [{ size: entity.size, transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } }],
    hubs: [
      [-halfTrack, hubY, -halfBase],
      [halfTrack, hubY, -halfBase],
      [-halfTrack, hubY, halfBase],
      [halfTrack, hubY, halfBase],
    ],
    wheelRadius: 0.36,
    suspensionRest: 0.35,
    stiffness: 35,
    engineForce: 2200,
    brakeForce: 30,
    driver: [0, 0.8, 0],
    cameraDistance: 8,
  }
}
