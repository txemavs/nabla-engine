/** Shared authored scene for the manual; uses only public package entry points. */
import { createEntity, parseScene } from '@nabla/engine/scene'
import { vehicleDefinition } from '@nabla/engine'

export function createManualScene() {
  const floor = createEntity('manual-floor', 'box', [0, -0.5, 0])
  floor.size = [500, 1, 500]
  const car = createEntity('manual-car', 'vehicle', [0, 1, 0])
  car.name = 'Manual compact'
  car.mass = 1100
  car.size = [1.8, 1.4, 4]
  car.vehicle = {
    ...vehicleDefinition(car),
    drivenWheels: 'front',
    engineForce: 2800,
    driver: [-0.35, 0.55, 0],
    cameraDistance: 8,
  }
  return parseScene({
    version: 1,
    name: 'Nabla manual — local floor',
    // Browser runtime requires geography even without a terrain provider.
    geography: { latitude: 0, longitude: 0, altitude: 0, imagery: 'offline' },
    sky: { mode: 'fixed', at: '2026-03-20T12:00:00.000Z' },
    entities: [floor, createEntity('manual-spawn', 'spawn', [0, 2, 6]), car],
  })
}
