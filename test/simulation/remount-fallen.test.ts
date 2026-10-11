/**
 * Picking up a fallen bike lifts it at its current location before mounting.
 * Mounting one that is still standing leaves it where it is.
 */
import { afterEach, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Vec3 } from '../../src/simulation/physics.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import type { Vehicle } from '../../src/entity/vehicle/vehicle.js'
import { startEjection, type RiderEjection } from '../../src/simulation/rider-ejection.js'

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

function scene(extra: ReturnType<typeof createEntity>[] = []) {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [200, 1, 200]
  sim = new Simulation({
    version: 1,
    name: 'Remount',
    entities: [
      floor,
      presetVehicle('vfr800', 'bike', [0, 0.6, 0]),
      createEntity('spawn', 'spawn', [1.2, 1, 0]),
      ...extra,
    ],
  })
  for (let i = 0; i < 30; i++) sim.step(1 / 60)
  return sim
}

const upY = (q: readonly number[]) => 1 - 2 * (q[0] * q[0] + q[2] * q[2])

it('picks up the crashed bike automatically when the thrown rider gets up beside it', () => {
  const s = scene()
  const internal = s as unknown as {
    vehicles: Map<string, Vehicle>
    ejection: RiderEjection | null
  }
  const bike = internal.vehicles.get('bike')!
  bike.body.quaternion.setFromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2)
  bike.body.velocity.setZero()
  bike.twoWheeled!.crashed = true
  bike.twoWheeled!.fallen = true
  internal.ejection = { ...startEjection('bike', 12), phase: 'rising', phaseElapsed: 1 }
  s.step(1 / 60)
  expect(s.playerBikeRecovery).not.toBeNull()
  for (let i = 0; i < 180; i++) s.step(1 / 60)
  expect(s.player.vehicleId).toBe('bike')
  expect(s.twoWheeledPose('bike')!.fallen).toBe(false)
})

it('starts lifting despite small terrain-induced sliding instead of waiting for perfect rest', () => {
  const s = scene()
  s.startInVehicle('bike')
  const bike = (s as unknown as { vehicles: Map<string, Vehicle> }).vehicles.get('bike')!
  bike.body.quaternion.setFromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2)
  bike.twoWheeled!.crashed = true
  for (let i = 0; i < 90 && !s.playerBikeRecovery; i++) {
    bike.body.velocity.set(0.9, 0, 0)
    bike.body.angularVelocity.setZero()
    s.step(1 / 60)
  }
  expect(s.playerBikeRecovery).not.toBeNull()
})

it('lifts a fallen bike in place before mounting even when road reset options are supplied', () => {
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
  const before = s.entityTransform('bike').position.slice()
  expect(s.interact({ snapToRoad: true, roads })).toBe('Levantando la moto')
  expect(s.player.vehicleId).toBeNull()
  for (let i = 0; i < 180; i++) s.step(1 / 60)
  expect(s.player.vehicleId).toBe('bike')
  expect(s.twoWheeledPose('bike')!.fallen).toBe(false)
  expect(s.twoWheeledPose('bike')!.crashed).toBe(false)
  const pose = s.entityTransform('bike')
  expect(pose.position[0]).toBeCloseTo(before[0], 1)
  expect(pose.position[2]).toBeCloseTo(before[2], 1)
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

it('can lift from the rider’s clear footing when the opposite side is blocked', () => {
  const wall = createEntity('wall', 'box', [-1.275, 1, 0])
  wall.size = [0.3, 2, 3]
  const s = scene([wall])
  const internals = s as unknown as { vehicles: Map<string, Vehicle>; playerBody: Vehicle['body'] }
  const bike = internals.vehicles.get('bike')!
  bike.body.quaternion.setFromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2)
  bike.body.position.y = 0.3
  bike.body.velocity.setZero()
  bike.twoWheeled!.fallen = true
  bike.twoWheeled!.crashed = true
  // The rider occupies the only usable side; their own collider must not block pickup.
  internals.playerBody.position.set(1.275, 0.94, 0)
  internals.playerBody.velocity.setZero()
  expect(s.interact()).toBe('Levantando la moto')
})

it('holds the lifted bike still until the avatar finishes boarding, even with throttle held', () => {
  const s = scene()
  const bike = (s as unknown as { vehicles: Map<string, Vehicle> }).vehicles.get('bike')!
  bike.body.quaternion.setFromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2)
  bike.twoWheeled!.fallen = true
  expect(s.interact()).toBe('Levantando la moto')
  for (let i = 0; i < 160 && s.playerBikeRecovery?.phase !== 'boarding'; i++) s.step(1 / 60)
  expect(s.playerBikeRecovery?.phase).toBe('boarding')
  expect(s.player.vehicleId).toBe('bike')
  const before = s.entityTransform('bike').position
  s.setInput({ ...idleInput(), forward: 1, right: 1 })
  for (let i = 0; i < 45; i++) {
    bike.body.velocity.set(2, 0, 1)
    s.step(1 / 60)
    expect(s.playerBikeRecovery?.phase).toBe('boarding')
    expect(s.entityTransform('bike').position).toEqual(before)
  }
  for (let i = 0; i < 10; i++) s.step(1 / 60)
  expect(s.playerBikeRecovery).toBeNull()
})

it('keeps the rising rider beside the bike instead of carrying dismount momentum away', () => {
  const s = scene()
  const internals = s as unknown as { vehicles: Map<string, Vehicle>; playerBody: Vehicle['body'] }
  const bike = internals.vehicles.get('bike')!
  s.startInVehicle('bike')
  bike.body.quaternion.setFromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2)
  bike.body.velocity.setZero()
  bike.body.angularVelocity.setZero()
  for (let i = 0; i < 180 && !s.playerBikeRecovery; i++) s.step(1 / 60)
  expect(s.playerBikeRecovery?.phase).toBe('rising')
  const start = s.player.position
  internals.playerBody.velocity.set(0.5, 0, 0.3)
  for (let i = 0; i < 20; i++) {
    s.step(1 / 60)
    expect(s.player.position[0]).toBeCloseTo(start[0], 6)
    expect(s.player.position[2]).toBeCloseTo(start[2], 6)
  }
})
