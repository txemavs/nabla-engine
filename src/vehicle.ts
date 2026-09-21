import type { Entity, VehicleDefinition } from './scene.js'

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
