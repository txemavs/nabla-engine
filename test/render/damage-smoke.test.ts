import { expect, it } from 'vitest'
import * as THREE from 'three'
import { VehicleDestruction } from '../../src/render/entity/vehicle-destruction.js'

it('emits black damage smoke before destruction and removes it after destruction or reset', () => {
  const space = new THREE.Group(),
    car = new THREE.Group()
  space.add(car)
  const effect = new VehicleDestruction(space)
  effect.setDamage('car', car, 100)
  expect(effect.root.children.filter((node) => node instanceof THREE.Points)).toHaveLength(0)
  effect.setDamage('car', car, 75)
  expect(effect.root.children.filter((node) => node instanceof THREE.Points)).toHaveLength(0)
  effect.setDamage('car', car, 50)
  expect(effect.root.children.filter((node) => node instanceof THREE.Points)).toHaveLength(0)
  effect.setDamage('car', car, 25)
  const smoke = effect.root.children.find((node) => node.name === 'Engine exhaust smoke')
  expect(smoke).toBeDefined()
  for (let frame = 0; frame < 10; frame++) effect.update(0.05, true)
  // The emitter handle shows while its particles live; they draw in the space's shared pool.
  expect(smoke!.visible).toBe(true)
  expect(space.children.some((node) => node instanceof THREE.Points && node.visible)).toBe(true)
  effect.setDamage('car', car, 0)
  expect(effect.root.children.includes(smoke!)).toBe(false)
  effect.setDamage('car', car, 20)
  effect.clear()
  expect(effect.root.children.filter((node) => node.name === 'Engine exhaust smoke')).toHaveLength(
    0,
  )
  effect.dispose()
})
