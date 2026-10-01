import { describe, expect, it } from 'vitest'
import { presetVehicle } from '../src/catalog/vehicles/library.js'
import { createEntity } from '../src/entity/schema.js'
import type { SceneDocument } from '../src/scene/document.js'
import { Vec3, type Quaternion } from '../src/simulation/physics.js'
import { idleInput, Simulation } from '../src/simulation/simulation.js'

describe('jeep pose', () => {
  it('settles on its tires', () => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [80, 1, 80]
    const doc: SceneDocument = {
      version: 1,
      name: 'pad',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [0, 0.05, 8]),
        presetVehicle('jeep', 'car', [0, 0.92, 0]),
      ],
    }
    const sim = new Simulation(doc, { playerMode: 'hover' })
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    const p = sim.entityTransform('car').position
    expect(p.every(Number.isFinite)).toBe(true)
    expect(p[1]).toBeGreaterThan(0.6)
    expect(p[1]).toBeLessThan(0.86)
    sim.dispose()
  })

  it('pulls with all four wheels and drops upright from 3 m', () => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [80, 1, 80]
    const doc: SceneDocument = {
      version: 1,
      name: 'pad',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [0, 0.05, 8]),
        presetVehicle('jeep', 'car', [0, 0.92, 0]),
      ],
    }
    const sim = new Simulation(doc, { playerMode: 'hover' })
    for (let i = 0; i < 30; i++) sim.step(1 / 60)
    sim.startInVehicle('car')
    sim.setInput({ ...idleInput(), forward: 1 })
    sim.step(1 / 60)
    const vehicle = (
      sim as unknown as {
        vehicles: Map<
          string,
          {
            body: { position: Vec3; quaternion: Quaternion; velocity: Vec3 }
            raycast: { wheelInfos: { engineForce: number }[] }
          }
        >
      }
    ).vehicles.get('car')!
    expect(vehicle.raycast.wheelInfos.map((wheel) => wheel.engineForce)).toEqual([
      2600, 2600, 2600, 2600,
    ])
    const before = vehicle.body.position.clone()
    vehicle.body.quaternion.setFromAxisAngle(new Vec3(0, 0, 1), Math.PI)
    expect(sim.recoverVehicle()).toBe('Coche enderezado')
    expect(vehicle.body.position.x).toBeCloseTo(before.x)
    expect(vehicle.body.position.z).toBeCloseTo(before.z)
    expect(vehicle.body.position.y).toBeCloseTo(before.y + 3)
    expect(vehicle.body.quaternion.vmult(new Vec3(0, 1, 0)).y).toBeGreaterThan(0.99)
    expect(vehicle.body.velocity.length()).toBe(0)
    sim.setInput(idleInput())
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    const start = sim.entityTransform('car').position
    sim.setInput({ ...idleInput(), forward: 1 })
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    const end = sim.entityTransform('car').position
    expect(Math.hypot(end[0] - start[0], end[2] - start[2])).toBeGreaterThan(3)
    expect(end[1]).toBeGreaterThan(0.5)
    sim.dispose()
  })
})
