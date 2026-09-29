/** A new procedural car through public APIs, without changing engine or Studio. */
import assert from 'node:assert/strict'
import {
  createEntity,
  vehicleDefinition,
  Simulation,
  initPhysics,
  idleInput,
  parseScene,
} from '@nabla/engine'
export function createCompact(id) {
  const car = createEntity(id, 'vehicle', [0, 1, 0])
  Object.assign(car, {
    name: 'Compact',
    motion: 'dynamic',
    mass: 1100,
    size: [1.8, 1.4, 4],
    color: '#647585',
  })
  car.vehicle = {
    ...vehicleDefinition(car),
    drivenWheels: 'front',
    engineForce: 2800,
    driver: [-0.35, 0.55, 0],
    headOffset: [0, -0.15, -0.26],
    cameraDistance: 8,
  }
  return car
}
await initPhysics()
const floor = createEntity('floor', 'box', [0, -0.5, 0])
floor.size = [500, 1, 500]
const scene = parseScene({
  version: 1,
  name: 'Custom car',
  entities: [floor, createEntity('spawn', 'spawn', [0, 2, 6]), createCompact('compact')],
})
const sim = new Simulation(scene)
try {
  for (let i = 0; i < 180; i++) sim.step(1 / 60)
  sim.startInVehicle('compact')
  sim.setInput({ ...idleInput(), forward: 1 })
  for (let i = 0; i < 240; i++) sim.step(1 / 60)
  assert(sim.vehicleInfo('compact').speedKmh > 10)
  console.log('Custom prefab drives through the existing Simulation: OK')
} finally {
  sim.dispose()
}
