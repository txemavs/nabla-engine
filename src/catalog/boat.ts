import { createEntity, type Entity, type Vec3Tuple } from '../entity/schema.js'

const posed = (position: Vec3Tuple) => ({
  position,
  rotation: [0, 0, 0, 1] as [number, number, number, number],
})

/**
 * 6 m planing outboard, 400 CV. Thrust is about 16 kN and levels near 30 m/s.
 * The keel sits 0.45 m under the origin. Forward is −Z, the motor is at +Z.
 */
export function createOutboard(id: string, position: Vec3Tuple = [0, 0.45, 0]): Entity {
  return {
    ...createEntity(id, 'vehicle', position),
    name: 'Fueraborda 6 m · 400 CV',
    color: '#d5dde4',
    size: [1.9, 2.04, 6],
    mass: 1100,
    vehicle: {
      boat: true,
      colliders: [{ size: [2.0, 0.62, 5.5], transform: posed([0, -0.12, 0]) }],
      hubs: [
        [-0.9, -0.2, -1.6],
        [0.9, -0.2, -1.6],
        [-0.9, -0.2, 1.6],
        [0.9, -0.2, 1.6],
      ],
      wheelRadius: 0.05,
      suspensionRest: 0.05,
      stiffness: 20,
      engineForce: 16000,
      brakeForce: 800,
      driver: [0, 0.95, 0.45],
      cameraDistance: 9,
    },
    visual: {
      body: { url: '/world/boat.outboard.glb', transform: posed([0, 0, 0]) },
    },
  }
}
