import type { DrivetrainState } from '../../simulation/vehicles/drivetrain.js'
import type { HubDefinition } from '../../simulation/vehicles/wheeled/contracts.js'
import type { Body, RaycastVehicle } from '../../simulation/physics.js'
import type { Entity } from '../schema.js'
import type { VehicleDefinition } from './field.js'

/** Runtime chassis. The persisted payload stays on `entity.vehicle`. */
export interface Vehicle {
  body: Body
  raycast: RaycastVehicle
  entity: Entity
  /** Normalized hub configurations derived from definition. */
  hubConfigs: HubDefinition[]
  steer: number
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
}

export function validateVehicle(entity: Entity): void {
  const spec = entity.vehicle
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
  if (entity.size[0] < 1 || entity.size[1] < 0.3 || entity.size[2] < 2)
    throw new Error('Vehicle is too small')
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
