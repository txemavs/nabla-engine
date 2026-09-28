import {
  createEntity,
  rotationDegrees,
  type Entity,
  type Transform,
  type Vec3Tuple,
} from '../../entity/schema.js'

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
    name: 'Audi S3 Nabla · 400 CV DSG',
    color: '#dadde1',
    size: [1.994, 1.332, 4.407],
    mass: 1400,
    vehicle: {
      colliders: [
        { size: [1.75, 0.48, 4.25], transform: posed([0, -0.1, 0]) },
        // Parabrisas glass, raked 28°. Clears the chassis so it only meets the ground in a rollover.
        { size: [1.4, 0.08, 0.78], transform: posed([0, 0.555, -0.625], [-28.3, 0, 0]) },
        // Trunk lid. Same idea at the tail: the bumper stops sinking when the car is on its back.
        { size: [1.6, 0.08, 0.8], transform: posed([0, 0.45, 1.72]) },
      ],
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
      drivenWheels: 'all',
      powertrain: {
        powerCv: 400,
        torqueNm: 520,
        ratios: [3.4, 2.75, 1.77, 1.13, 0.92, 0.76, 0.64],
        finalDrive: 4.06,
        grip: 4.8,
      },
      brakeForce: 65,
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
