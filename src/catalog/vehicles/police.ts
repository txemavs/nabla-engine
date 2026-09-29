import { createEntity, rotationDegrees, type Entity, type Vec3Tuple } from '../../entity/schema.js'
const pose = (position: Vec3Tuple) => ({ position, rotation: rotationDegrees(0, 0, 0) })
/** Bilbao livery adaptation of the supplied Focus RS; dimensions measured from the prepared GLB. */
export function createPoliceCar(id: string, position: Vec3Tuple = [5, 0.69, 5]): Entity {
  const com = 0.62,
    radius = 0.3249
  return {
    ...createEntity(id, 'vehicle', position),
    name: 'Policía Municipal · Bilbao',
    color: '#eeeeee',
    size: [2.031, 1.744, 4.407] as Vec3Tuple,
    mass: 1600,
    vehicle: {
      colliders: [
        { size: [1.7, 0.45, 4.12] as Vec3Tuple, transform: pose([0, -0.12, 0]) },
        { size: [1.46, 0.68, 2.3] as Vec3Tuple, transform: pose([0, 0.51, 0.32]) },
      ],
      hubs: [
        [-0.7813, radius - com, -1.29],
        [0.7813, radius - com, -1.29],
        [-0.76125, radius - com, 1.375],
        [0.76125, radius - com, 1.375],
      ],
      wheelRadius: radius,
      suspensionRest: 0.22,
      suspensionTravel: 0.25,
      stiffness: 30,
      engineForce: 2200,
      drivenWheels: 'front' as const,
      brakeForce: 65,
      driver: [-0.35, 0.79, 0.3] as Vec3Tuple,
      headOffset: [0, -0.15, -0.26],
      cameraDistance: 7,
    },
    visual: {
      presentation: 'nabla.police',
      body: { url: '/world/car.ford.focus.police.glb', transform: pose([0, -com, 0]) },
      wheel: { url: '/world/car.ford.focus.wheel.glb', transform: pose([0, 0, 0]) },
      wheelRotations: [
        rotationDegrees(0, 0, 0),
        rotationDegrees(0, 180, 0),
        rotationDegrees(0, 0, 0),
        rotationDegrees(0, 180, 0),
      ],
    },
  }
}
