import { expect, it } from 'vitest'
import * as THREE from 'three'
import { VehicleDestruction } from '../../src/render/entity/vehicle-destruction.js'

const fireballs = (space: THREE.Group) =>
  space.children.filter(
    (node): node is THREE.Mesh =>
      node instanceof THREE.Mesh && node.geometry.type === 'SphereGeometry',
  )

it('a burst is the explosion flash at a fraction of the size, and is removed after the flash', () => {
  const space = new THREE.Group()
  const effect = new VehicleDestruction(space)
  effect.burst(new THREE.Vector3(1, 2, 3), 0.2)
  const [fire] = fireballs(space)
  expect(fire.position.toArray()).toEqual([1, 2, 3])
  effect.update(0.1, true)
  effect.update(0.1, true)
  // The vehicle flash is 0.2 + age × 8 across; a 0.2 burst is a fifth of it.
  expect(fire.scale.x).toBeCloseTo((0.2 + 0.2 * 8) * 0.2)
  for (let i = 0; i < 3; i++) effect.update(0.1, true)
  expect(fireballs(space)).toHaveLength(0)
  effect.dispose()
})

it('bursts are bounded and ignore a bad scale', () => {
  const space = new THREE.Group()
  const effect = new VehicleDestruction(space)
  effect.burst(new THREE.Vector3(), 0)
  effect.burst(new THREE.Vector3(), Number.NaN)
  expect(fireballs(space)).toHaveLength(0)
  for (let i = 0; i < 60; i++) effect.burst(new THREE.Vector3(), 0.2)
  expect(fireballs(space)).toHaveLength(24)
  effect.clear()
  expect(fireballs(space)).toHaveLength(0)
  effect.dispose()
})

it('bursts reuse their fireball material instead of creating and disposing one each time', () => {
  const space = new THREE.Group()
  const effect = new VehicleDestruction(space)
  effect.burst(new THREE.Vector3(), 0.2)
  const [first] = fireballs(space)
  let disposed = 0
  ;(first.material as THREE.Material).addEventListener('dispose', () => disposed++)
  for (let i = 0; i < 5; i++) effect.update(0.1, true)
  expect(fireballs(space)).toHaveLength(0)
  effect.burst(new THREE.Vector3(4, 0, 0), 0.2)
  const [second] = fireballs(space)
  expect(second).toBe(first)
  expect(second.material).toBe(first.material)
  expect((second.material as THREE.MeshBasicMaterial).opacity).toBe(1)
  expect(disposed).toBe(0)
  effect.dispose()
  expect(disposed).toBe(1)
})
