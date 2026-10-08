/** Ride smoothing on a real ride: the S3 on a bumpy straight at speed, physics untouched. */
import * as THREE from 'three'
import { afterEach, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { parseScene } from '../../src/scene/document.js'
import { RideSmoothing, rideSmoothingSettings } from '../../src/render/entity/ride-smoothing.js'
import { finishStartUp } from '../start-up.js'

let sim: Simulation | undefined
afterEach(() => sim?.dispose())

it('the eye bounces much less than the body over road bumps at speed', () => {
  const floor = createEntity('floor', 'box', [0, -0.5, -400])
  floor.size = [40, 1, 900]
  // Low ridges across the road every 1.5 m: 2 cm high.
  const ridges = Array.from({ length: 200 }, (_, i) => {
    const ridge = createEntity(`ridge${i}`, 'box', [0, 0.005, -120 - i * 1.5])
    ridge.size = [40, 0.02, 0.4]
    return ridge
  })
  const car = presetVehicle('car', 'car', [0, 0.7, 0])
  sim = new Simulation(
    parseScene({
      version: 1,
      name: 'Bumps',
      entities: [floor, ...ridges, car, createEntity('spawn', 'spawn', [5, 1, 5])],
    }),
  )
  sim.startInVehicle('car')
  finishStartUp(sim)
  const settings = rideSmoothingSettings(car)
  const smoothing = new RideSmoothing()
  const raw: number[] = [],
    eye: number[] = [],
    speeds: number[] = []
  sim.setInput({ ...idleInput(), forward: 1 })
  for (let i = 0; i < 60 * 14; i++) {
    sim.step(1 / 60)
    const t = sim.entityTransform('car', true)
    smoothing.update('car', t.position, t.rotation, 1 / 60, settings)
    const head = new THREE.Vector3(-0.35, 0.6, 0.2)
      .applyQuaternion(new THREE.Quaternion().fromArray(t.rotation))
      .add(new THREE.Vector3().fromArray(t.position))
    const rawHead = head.y
    smoothing.apply('car', head)
    const z = t.position[2]
    if (z < -130 && z > -400) {
      raw.push(rawHead)
      eye.push(head.y)
      speeds.push(sim.vehicleInfo('car').speedKmh)
    }
  }
  expect(raw.length).toBeGreaterThan(60)
  expect(Math.max(...speeds)).toBeGreaterThan(80)
  // Frame-to-frame jitter (the shake) of the eye height: well below the body's.
  const jitter = (values: number[]) => {
    let sum = 0
    for (let i = 1; i < values.length - 1; i++)
      sum += Math.abs(values[i + 1] - 2 * values[i] + values[i - 1])
    return sum / (values.length - 2)
  }
  expect(jitter(raw)).toBeGreaterThan(1e-4)
  expect(jitter(eye)).toBeLessThan(jitter(raw) * 0.6)
  // Same mean height: no drift through the car.
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
  expect(Math.abs(mean(eye) - mean(raw))).toBeLessThan(0.01)
})
