import {
  createEntity,
  rotationDegrees,
  type Entity,
  type Vec3Tuple,
  type Transform,
} from './scene.js'
const transform = (position: Vec3Tuple = [0, 0, 0], angles: Vec3Tuple = [0, 0, 0]): Transform => ({
  position,
  rotation: rotationDegrees(...angles),
})

/** Original GLBs use metres/Y-up. The A3 faces +Z: one explicit 180° import rotation. */
export function createA3(id: string, position: Vec3Tuple = [4, 0.62, 6]): Entity {
  const radius = 0.315374,
    com = 0.55,
    hubY = radius - com
  return {
    ...createEntity(id, 'vehicle', position),
    name: 'Audi A3 Cabrio',
    color: '#dadde1',
    size: [1.994, 1.332, 4.407],
    mass: 1400,
    vehicle: {
      colliders: [{ size: [1.75, 0.48, 4.25], transform: transform([0, -0.1, 0]) }],
      hubs: [
        [-0.7622195, hubY, -1.291815],
        [0.7622195, hubY, -1.291815],
        [-0.7547195, hubY, 1.291815],
        [0.7547195, hubY, 1.291815],
      ],
      wheelRadius: radius,
      suspensionRest: 0.16,
      stiffness: 65,
      engineForce: 2600,
      brakeForce: 36,
      driver: [-0.356, 0.7, 0.32],
      cameraDistance: 6.5,
    },
    visual: {
      body: {
        url: '/world/car.audi.a3.cabrio.glb',
        transform: transform([0, -com, 0], [0, 180, 0]),
      },
      wheel: { url: '/world/car.audi.a3.wheel.glb', transform: transform() },
      wheelRotations: [
        rotationDegrees(0, 180, 0),
        rotationDegrees(0, 0, 0),
        rotationDegrees(0, 180, 0),
        rotationDegrees(0, 0, 0),
      ],
      // Steering mount is already converted to the engine's -Z-forward body frame.
      steering: {
        url: '/world/car.audi.a3.steering.glb',
        transform: transform([-0.356, 0.824 - com, -0.311], [25, 180, 0]),
      },
    },
  }
}

/** Colliders measured from the original GLB, all relative to a COM 1.2 m above its origin. */
export function createCarrier(id: string, position: Vec3Tuple = [4, 1.2, -12]): Entity {
  const com = 1.2
  const collider = (size: Vec3Tuple, p: Vec3Tuple, angles: Vec3Tuple = [0, 0, 0]) => ({
    size,
    transform: transform([p[0], p[1] - com, p[2]], angles),
  })
  return {
    ...createEntity(id, 'vehicle', position),
    name: 'Container 5 × 10',
    size: [5, 3.2, 10],
    mass: 20000,
    color: '#627787',
    vehicle: {
      colliders: [
        collider([4.876, 0.145, 10.1], [0, 0.2225, 0.05]),
        collider([4.876, 0.08, 9.996], [0, 3.31, 0]),
        collider([0.1, 3.2, 9.88], [-2.45, 1.75, 0]),
        collider([0.1, 3.2, 9.88], [2.45, 1.75, 0]),
        collider([1.796, 2.971, 0.04], [-1.498, 1.7825, 0]),
        collider([4.71, 0.05, 2.915], [0, 0.1375, 6.55], [5.22, 0, 0]),
        collider([2.55, 0.92, 0.7], [0, 0.752, -3.45]),
        collider([1.796, 2.971, 0.04], [1.498, 1.7825, 0]),
        collider([1.2, 0.851, 0.04], [0, 2.8425, 0]),
      ],
      hubs: [
        [-2.02, -1.08, -4.52],
        [2.02, -1.08, -4.52],
        [-2.02, -1.08, 4.52],
        [2.02, -1.08, 4.52],
      ],
      wheelRadius: 0.12,
      suspensionRest: 0.18,
      stiffness: 80,
      engineForce: 32000,
      brakeForce: 300,
      driver: [0, 2.25 - com, -2.8],
      cameraDistance: 15,
      flight: true,
      interior: {
        min: [-2.32, 0.295 - com, -4.95],
        max: [2.32, 3.2 - com, 4.95],
        exit: [1.85, 0.35, -2.8],
      },
      garage: {
        min: [-2.32, 0.295 - com, 0.07],
        max: [2.32, 3.2 - com, 4.95],
        ramp: {
          colliderIndex: 5,
          hinge: [0, 0.27 - com, 5.1],
          closeAngle: (-95.22 * Math.PI) / 180,
        },
      },
    },
    visual: {
      body: { url: '/world/ship.container.5x10.glb', transform: transform([0, -com, 0]) },
      ramp: {
        nodes: ['Ramp', 'Ramp_Lip_NegX', 'Ramp_Lip_PosX', 'Brand_Nabla_Ramp'],
        hinge: [0, 0.27, 5.1],
        closeAngle: (-95.22 * Math.PI) / 180,
      },
    },
  }
}
