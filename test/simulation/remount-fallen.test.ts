/**
 * Mounting a bike that is on the ground is the R reset: seated, upright, snapped to the
 * nearest road. Mounting one that is still standing leaves it where it is.
 */
import { afterEach, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Vec3 } from '../../src/simulation/physics.js'
import { Simulation } from '../../src/simulation/simulation.js'

let sim: Simulation | undefined
afterEach(() => {
  sim?.dispose()
  sim = undefined
})

const roads = [
  {
    points: [
      { x: -40, z: 12 },
      { x: 40, z: 12 },
    ],
    width: 6,
  },
]

function scene() {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [200, 1, 200]
  sim = new Simulation({
    version: 1,
    name: 'Remount',
    entities: [
      floor,
      presetVehicle('vfr800', 'bike', [0, 0.6, 0]),
      createEntity('spawn', 'spawn', [1.2, 1, 0]),
    ],
  })
  for (let i = 0; i < 30; i++) sim.step(1 / 60)
  return sim
}

const upY = (q: readonly number[]) => 1 - 2 * (q[0] * q[0] + q[2] * q[2])

it('stands a fallen bike up on the nearest road when the rider mounts it', () => {
  const s = scene()
  const bike = (
    s as unknown as {
      vehicles: Map<
        string,
        {
          twoWheeled: { fallen: boolean; crashed: boolean }
          body: {
            quaternion: { setFromAxisAngle(axis: Vec3, angle: number): void }
            wakeUp(): void
          }
        }
      >
    }
  ).vehicles.get('bike')!
  // On its side, the way a crash leaves it, with the rider already on foot beside it.
  bike.body.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), Math.PI / 2)
  bike.twoWheeled.fallen = true
  bike.twoWheeled.crashed = true
  bike.body.wakeUp()
  expect(s.player.vehicleId).toBeNull()
  expect(s.interact({ snapToRoad: true, roads })).toBe('En la vía más cercana')
  expect(s.player.vehicleId).toBe('bike')
  expect(s.twoWheeledPose('bike')!.fallen).toBe(false)
  expect(s.twoWheeledPose('bike')!.crashed).toBe(false)
  const pose = s.entityTransform('bike')
  expect(pose.position[2]).toBeCloseTo(12, 0)
  expect(upY(pose.rotation)).toBeGreaterThan(0.99)
})

it('does not move an upright bike onto the road when mounting it', () => {
  const s = scene()
  const before = s.entityTransform('bike').position.slice()
  expect(s.interact({ snapToRoad: true, roads })).toMatch(/Conduciendo/)
  const after = s.entityTransform('bike').position
  expect(after[0]).toBeCloseTo(before[0], 1)
  expect(after[2]).toBeCloseTo(before[2], 1)
  expect(s.twoWheeledPose('bike')!.fallen).toBe(false)
})
