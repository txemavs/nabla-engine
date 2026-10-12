import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { TrunkBalloons } from '../../src/render/entity/trunk-balloons.js'

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
