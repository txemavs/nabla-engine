import { createEntity, rotationDegrees, type Entity, type Transform, type Vec3Tuple } from '../entity/schema.js'

const posed = (position: Vec3Tuple = [0, 0, 0], angles: Vec3Tuple = [0, 0, 0]): Transform => ({
  position,
  rotation: rotationDegrees(...angles),
})

/** Original GLBs use metres/Y-up. The A3 faces +Z: one explicit 180° import rotation. */
export function createA3(id: string, position: Vec3Tuple = [4, 0.62, 6]): Entity {
  const radius = 0.315374,
    com = 0.55,
    // Extend the wheels 5 cm below the body; keep the upper spring mounts fixed.
    hubY = radius - com - 0.05
  return {
    ...createEntity(id, 'vehicle', position),
    name: 'Audi A3 Cabrio',
    color: '#dadde1',
    size: [1.994, 1.332, 4.407],
    mass: 1400,
    vehicle: {
      colliders: [{ size: [1.75, 0.48, 4.25], transform: posed([0, -0.1, 0]) }],
      hubs: [
        [-0.7622195, hubY, -1.291815],
        [0.7622195, hubY, -1.291815],
        [-0.7547195, hubY, 1.291815],
        [0.7547195, hubY, 1.291815],
      ],
      wheelRadius: radius,
      suspensionRest: 0.21,
      stiffness: 65,
      engineForce: 2600,
      brakeForce: 36,
      driver: [-0.356, 0.7, 0.32],
      cameraDistance: 6.5,
    },
    visual: {
      body: {
        url: '/world/car.audi.a3.cabrio.glb',
        transform: posed([0, -com, 0], [0, 180, 0]),
      },
      wheel: { url: '/world/car.audi.a3.wheel.glb', transform: posed() },
      wheelRotations: [
        rotationDegrees(0, 180, 0),
        rotationDegrees(0, 0, 0),
        rotationDegrees(0, 180, 0),
        rotationDegrees(0, 0, 0),
      ],
      // Steering mount is already converted to the engine's -Z-forward body frame.
      steering: {
        url: '/world/car.audi.a3.steering.glb',
        transform: posed([-0.355606, 0.266521, -0.408524], [22.06, 180, 0]),
      },
    },
  }
}
