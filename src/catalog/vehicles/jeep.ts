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

/** Wrangler: shared low-poly wheels; metres, Y-up, -Z forward.
 * COM, hubs and simple colliders match the prepared model, not the retired Gladiator.
 */
export function createJeep(id: string, position: Vec3Tuple = [9, 0.86, 6]): Entity {
  const radius = 0.406473,
    com = 0.78
  return {
    ...createEntity(id, 'vehicle', position),
    name: 'Jeep Wrangler',
    color: '#cc0000',
    size: [1.95, 1.974, 4.197],
    mass: 1800,
    vehicle: {
      colliders: [
        { size: [1.64, 0.42, 3.94], transform: posed([0, -0.14, -0.06]) },
        { size: [1.48, 0.92, 2.32], transform: posed([0, 0.59, 0.55]) },
        { size: [1.48, 0.36, 1.1], transform: posed([0, 0.35, -1.18]) },
      ],
      hubs: [
        [-0.81, radius - com, -1.3627255],
        [0.81, radius - com, -1.3627255],
        [-0.81, radius - com, 1.1172745],
        [0.81, radius - com, 1.1172745],
      ],
      wheelRadius: radius,
      suspensionRest: 0.3,
      suspensionTravel: 0.35,
      stiffness: 24,
      engineForce: 2600,
      drivenWheels: 'all',
      brakeForce: 65,
      // Head centre: 1.58 m above ground, just ahead of the front headrest.
      driver: [-0.39, 0.95, -0.03],
      cameraDistance: 7,
    },
    visual: {
      body: { url: '/world/car.jeep.wrangler.glb', transform: posed([0, -com, 0]) },
      wheel: { url: '/world/car.jeep.wrangler.wheel.glb', transform: posed() },
      wheelRotations: [
        rotationDegrees(0, 0, 0),
        rotationDegrees(0, 180, 0),
        rotationDegrees(0, 0, 0),
        rotationDegrees(0, 180, 0),
      ],
    },
  }
}
