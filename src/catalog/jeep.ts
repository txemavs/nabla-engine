import {
  createEntity,
  rotationDegrees,
  type Entity,
  type Transform,
  type Vec3Tuple,
} from '../entity/schema.js'

const posed = (position: Vec3Tuple = [0, 0, 0], angles: Vec3Tuple = [0, 0, 0]): Transform => ({
  position,
  rotation: rotationDegrees(...angles),
})

/**
 * 2020 Jeep Gladiator. Body, wheel and steering GLBs are metres, Y-up, −Z forward.
 * The steering rim is already centred on its local Z axis.
 * Spawn sits above the unloaded tire contact: Rapier NaNs if a wheel starts in the ground.
 * Soft springs sag about 10 cm and still have travel left for rocks.
 * 3400 N on each wheel is about 400 hp at 80 km/h.
 */
export function createJeep(id: string, position: Vec3Tuple = [9, 0.92, 6]): Entity {
  const radius = 0.415691,
    com = 0.85,
    frontHubY = 0.414993 - com,
    rearHubY = 0.417 - com
  return {
    ...createEntity(id, 'vehicle', position),
    name: 'Jeep Gladiator',
    color: '#c01518',
    size: [2.007, 2.032, 5.541],
    mass: 2200,
    vehicle: {
      colliders: [
        { size: [1.88, 0.58, 5.35], transform: posed([0, -0.22, 0.28]) },
        { size: [1.62, 0.78, 1.55], transform: posed([0, 0.48, -0.95]) },
        { size: [1.55, 0.12, 0.9], transform: posed([0, 0.22, -2.02]) },
      ],
      hubs: [
        [-0.8404, frontHubY, -1.733],
        [0.846628, frontHubY, -1.733],
        [-0.8414, rearHubY, 1.768],
        [0.8486, rearHubY, 1.768],
      ],
      wheelRadius: radius,
      suspensionRest: 0.42,
      suspensionTravel: 0.48,
      stiffness: 24,
      engineForce: 3400,
      drivenWheels: 'all',
      brakeForce: 80,
      // Eyes land on the windshield center: head pose adds (0, −0.15, −0.26).
      driver: [0, 0.56, -0.64],
      cameraDistance: 9,
    },
    visual: {
      body: {
        url: '/world/car.jeep.gladiator.glb',
        transform: posed([0, -com, 0]),
      },
      wheel: { url: '/world/car.jeep.gladiator.wheel.glb', transform: posed() },
      wheelRotations: [
        rotationDegrees(0, 180, 0),
        rotationDegrees(0, 0, 0),
        rotationDegrees(0, 180, 0),
        rotationDegrees(0, 0, 0),
      ],
      steering: {
        url: '/world/car.jeep.gladiator.steering.glb',
        transform: {
          position: [-0.5849, 1.208615 - com, -1.2482],
          rotation: [0.129534, 0.848141, 0.452769, -0.242647],
        },
      },
    },
  }
}
