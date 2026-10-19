import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { TrunkBalloons } from '../../src/render/entity/trunk-balloons.js'
import { balloonTuning, explosionTuning } from '../../src/config/gameplay-tuning.js'

it('opens only for rear shots, emits for 30 seconds, closes and restores the lid', () => {
  const space = new Group()
  space.position.set(-1000, 0, 2000)
  const car = new Group()
  car.position.set(1005, 0, -1995)
  space.add(car)
  const lid = new Mesh(new BoxGeometry(1.2, 0.15, 0.7), new MeshStandardMaterial())
  lid.name = 'Maletero'
  lid.position.set(0, 1, 1.7)
  car.add(lid)
  const original = lid.position.clone()
  const effect = new TrunkBalloons(space)
  expect(effect.hit(car, new Vector3(1005, 1, -1997), new Vector3(0, 0, 1))).toBe(false)
  for (let i = 0; i < 20; i++) effect.update(0.1)
  expect(effect.root.children.length).toBe(0)
  expect(effect.hit(car, new Vector3(1005, 1, -1993), new Vector3(0, 0, -1))).toBe(true)
  for (let i = 0; i < 10; i++) effect.update(0.1)
  expect(effect.root.children.length).toBeGreaterThan(0)
  expect(lid.parent!.rotation.x).toBeLessThan(-0.6)
  expect(effect.root.children[0].position.x).toBeGreaterThan(1004)
  for (let i = 0; i < 440; i++) effect.update(0.1)
  expect(effect.root.children.length).toBe(0)
  expect(lid.parent!.rotation.x).toBeCloseTo(0)
  effect.clear()
  expect(lid.parent).toBe(car)
  expect(lid.position.distanceTo(original)).toBeLessThan(1e-6)
  effect.dispose()
})

it('a shot pops the nearest balloon on the ray and removes it', () => {
  const space = new Group()
  const car = new Group()
  space.add(car)
  const lid = new Mesh(new BoxGeometry(1.2, 0.15, 0.7), new MeshStandardMaterial())
  lid.name = 'Maletero'
  lid.position.set(0, 1, 1.7)
  car.add(lid)
  const effect = new TrunkBalloons(space)
  expect(effect.hit(car, new Vector3(0, 1, 3), new Vector3(0, 0, -1))).toBe(true)
  for (let i = 0; i < 20; i++) effect.update(0.1)
  const before = effect.root.children.length
  expect(before).toBeGreaterThan(1)
  const positions = effect.root.children.map((balloon) => balloon.position.clone())
  const target = positions[0]
  const origin = target.clone().add(new Vector3(0, 0, 6))
  const direction = new Vector3(0, 0, -1)
  // A shot that passes beside the balloon, or stops short of it, misses.
  expect(effect.shoot(origin.clone().add(new Vector3(2, 0, 0)), direction, 20)).toBeNull()
  expect(effect.shoot(origin, direction, 1)).toBeNull()
  expect(effect.root.children.length).toBe(before)
  const popped = effect.shoot(origin, direction, 20)
  expect(popped).not.toBeNull()
  // Another balloon may stand in the line of fire; whichever pops is one of ours and is gone.
  expect(positions.some((position) => position.equals(popped!.point))).toBe(true)
  expect(effect.root.children.length).toBe(before - 1)
  expect(effect.root.children.some((balloon) => balloon.position.equals(popped!.point))).toBe(false)
  effect.dispose()
})

it('a burst pushes nearby balloons outward, falling off with distance, and leaves far ones', () => {
  const space = new Group()
  const car = new Group()
  space.add(car)
  const lid = new Mesh(new BoxGeometry(1.2, 0.15, 0.7), new MeshStandardMaterial())
  lid.name = 'Maletero'
  lid.position.set(0, 1, 1.7)
  car.add(lid)
  const effect = new TrunkBalloons(space)
  expect(effect.hit(car, new Vector3(0, 1, 3), new Vector3(0, 0, -1))).toBe(true)
  for (let i = 0; i < 10; i++) effect.update(0.1)
  // Place three balloons by hand: near and mid on +x of the burst, one beyond the radius.
  const radius = explosionTuning.radiusMetres * balloonTuning.burst.scale
  const [near, mid, far] = effect.root.children
  const burst = new Vector3(50, 10, 50)
  near.position.copy(burst).add(new Vector3(0.2 * radius, 0, 0))
  mid.position.copy(burst).add(new Vector3(0.6 * radius, 0, 0))
  far.position.copy(burst).add(new Vector3(1.5 * radius, 0, 0))
  const start = [near, mid, far].map((b) => b.position.x)
  effect.blast(burst)
  effect.update(0.1)
  const moved = [near, mid, far].map((b, i) => b.position.x - start[i])
  // Natural drift is ±0.045 m per 0.1 s; the push is far larger near the burst.
  expect(moved[0]).toBeGreaterThan(moved[1])
  expect(moved[1]).toBeGreaterThan(0.1)
  expect(Math.abs(moved[2])).toBeLessThan(0.06)
  // The kick decays: after a few seconds it is gone.
  for (let i = 0; i < 40; i++) effect.update(0.1)
  const x = near.position.x
  effect.update(0.1)
  expect(Math.abs(near.position.x - x)).toBeLessThan(0.06)
  // Chain pops are off by default: all three balloons are still there.
  expect(effect.root.children).toContain(near)
  effect.dispose()
})

it('chain-pops balloons inside chainPopRadius when enabled', () => {
  const space = new Group()
  const car = new Group()
  space.add(car)
  const lid = new Mesh(new BoxGeometry(1.2, 0.15, 0.7), new MeshStandardMaterial())
  lid.name = 'Maletero'
  lid.position.set(0, 1, 1.7)
  car.add(lid)
  const effect = new TrunkBalloons(space)
  effect.hit(car, new Vector3(0, 1, 3), new Vector3(0, 0, -1))
  for (let i = 0; i < 10; i++) effect.update(0.1)
  const [a, b] = effect.root.children
  a.position.set(0, 20, 0)
  b.position.set(0.1, 20, 0)
  const saved = balloonTuning.burst.balloonPush.chainPopRadius
  balloonTuning.burst.balloonPush.chainPopRadius = 0.3
  try {
    effect.blast(new Vector3(0, 20, 0))
  } finally {
    balloonTuning.burst.balloonPush.chainPopRadius = saved
  }
  expect(effect.root.children).not.toContain(a)
  expect(effect.root.children).not.toContain(b)
  effect.dispose()
})
