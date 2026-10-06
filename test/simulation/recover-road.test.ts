import { describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import type { SceneDocument } from '../../src/scene/document.js'
import { Vec3 } from '../../src/simulation/physics.js'
import { Simulation } from '../../src/simulation/simulation.js'
import { nearestRoadPoint } from '../../src/simulation/road-snap.js'

describe('nearestRoadPoint', () => {
  it('projects onto the closest segment within range', () => {
    const roads = [
      {
        points: [
          { x: -50, z: 20 },
          { x: 50, z: 20 },
        ],
        width: 6,
      },
      {
        points: [
          { x: 100, z: -100 },
          { x: 100, z: 100 },
        ],
        width: 6,
      },
    ]
    const hit = nearestRoadPoint(3, 1, roads)!
    expect(hit.x).toBeCloseTo(3)
    expect(hit.z).toBeCloseTo(20)
    expect(hit.distance).toBeCloseTo(19)
    expect(Math.abs(hit.dx)).toBeCloseTo(1)
    expect(nearestRoadPoint(3, 1, roads, 10)).toBeNull()
  })
})

describe('R reset on the nearest road', () => {
  const scene = (): SceneDocument => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [200, 1, 200]
    return {
      version: 1,
      name: 'pad',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [0, 0.05, 8]),
        presetVehicle('car', 'car', [0, 1, 0]),
      ],
    }
  }
  const body = (sim: Simulation) =>
    (
      sim as unknown as {
        vehicles: Map<string, { body: { position: Vec3; quaternion: { vmult(v: Vec3): Vec3 } } }>
      }
    ).vehicles.get('car')!.body

  it('moves onto the road, upright, facing along it', () => {
    const sim = new Simulation(scene(), { playerMode: 'hover' })
    for (let i = 0; i < 30; i++) sim.step(1 / 60)
    sim.startInVehicle('car')
    const roads = [
      {
        points: [
          { x: -60, z: 25 },
          { x: 60, z: 25 },
        ],
        width: 6,
      },
    ]
    expect(sim.recoverVehicle({ snapToRoad: true, roads })).toBe('En la vía más cercana')
    const b = body(sim)
    expect(b.position.z).toBeCloseTo(25)
    expect(Math.abs(b.position.x)).toBeLessThan(1)
    expect(b.position.y).toBeGreaterThan(2.5)
    expect(b.position.y).toBeLessThan(3.5)
    const forward = b.quaternion.vmult(new Vec3(0, 0, -1))
    expect(Math.abs(forward.x)).toBeGreaterThan(0.99)
    expect(b.quaternion.vmult(new Vec3(0, 1, 0)).y).toBeGreaterThan(0.99)
    sim.dispose()
  })

  it('uprights in place when no road is near or the option is off', () => {
    const sim = new Simulation(scene(), { playerMode: 'hover' })
    for (let i = 0; i < 30; i++) sim.step(1 / 60)
    sim.startInVehicle('car')
    const before = body(sim).position.clone()
    expect(
      sim.recoverVehicle({
        snapToRoad: true,
        roads: [
          {
            points: [
              { x: 900, z: 0 },
              { x: 950, z: 0 },
            ],
            width: 6,
          },
        ],
      }),
    ).toBe('Sin vía cerca · coche enderezado')
    expect(body(sim).position.x).toBeCloseTo(before.x)
    expect(body(sim).position.z).toBeCloseTo(before.z)
    const roads = [
      {
        points: [
          { x: -60, z: 25 },
          { x: 60, z: 25 },
        ],
        width: 6,
      },
    ]
    expect(sim.recoverVehicle({ roads })).toBe('Coche enderezado')
    expect(body(sim).position.z).toBeCloseTo(before.z)
    sim.dispose()
  })
})
