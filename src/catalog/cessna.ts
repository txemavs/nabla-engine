import { createEntity, type Entity, type Vec3Tuple } from '../entity/schema.js'

const posed = (position: Vec3Tuple) => ({
  position,
  rotation: [0, 0, 0, 1] as [number, number, number, number],
})

/**
 * Cessna 172, 11 m span. Nose is −Z, tyre contact is 0.84 m under the origin.
 * Plane helm lifts off near 28 m/s and levels around 60 m/s.
 */
export function createCessna(id: string, position: Vec3Tuple = [0, 0.95, 0]): Entity {
  return {
    ...createEntity(id, 'vehicle', position),
    name: 'Cessna 172',
    color: '#e7e1d4',
    size: [11, 2.79, 7.83],
    mass: 1000,
    vehicle: {
      flight: true,
      plane: true,
      colliders: [
        { size: [1.15, 1.2, 4.2], transform: posed([0, 0.2, -0.2]) },
        { size: [10.6, 0.18, 1.55], transform: posed([0, 0.45, 0.05]) },
        { size: [0.14, 1.05, 0.85], transform: posed([0, 0.95, 4.6]) },
        { size: [3.3, 0.1, 0.7], transform: posed([0, 0.72, 5.05]) },
      ],
      hubs: [
        [-0.12, -0.62, -1.18],
        [0.12, -0.62, -1.18],
        [-1.33, -0.62, 0.35],
        [1.33, -0.62, 0.35],
      ],
      wheelRadius: 0.22,
      suspensionRest: 0.25,
      stiffness: 40,
      engineForce: 4500,
      brakeForce: 500,
      driver: [0, 0.35, -0.65],
      cameraDistance: 18,
    },
    visual: {
      body: { url: '/world/cessna.172.glb', transform: posed([0, 0, 0]) },
    },
  }
}
