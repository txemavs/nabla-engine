import * as THREE from 'three'
import { expect, it } from 'vitest'
import { Streetlights } from '../../src/render/entity/streetlights.js'
import { createPlaceable } from '../../src/catalog/placeables.js'

it('keeps separate fixed light counts while poles are added, removed and switched off', () => {
  const root = new THREE.Group()
  const lamps = new Streetlights(root, { spots: 1, points: 1 })
  const lights = root.children.filter(
    (object): object is THREE.Light => object instanceof THREE.Light,
  )
  expect(lights.map((light) => light.type).sort()).toEqual(['PointLight', 'SpotLight'])
  for (const [shape, id, x] of [
    ['globe', 'near', 2],
    ['globe', 'far', 12],
    ['streetlight', 'highway', 4],
  ] as const) {
    const [entity] = createPlaceable(shape, id)
    entity.light!.nightOnly = true
    entity.light!.intensity = x * 100
    const group = new THREE.Group()
    group.position.x = x
    root.add(group)
    lamps.add(entity, group)
  }
  lamps.update(new THREE.Vector3(), true, 100)
  const point = lights.find((light) => light instanceof THREE.PointLight)!
  const spot = lights.find((light) => light instanceof THREE.SpotLight)!
  expect(point.intensity).toBe(200)
  expect(spot.intensity).toBe(400)
  expect(lights.every((light) => light.visible && !light.castShadow)).toBe(true)
  lamps.update(new THREE.Vector3(15, 0, 0), true, 100)
  expect(point.intensity).toBe(1200)
  lamps.remove('far')
  lamps.update(new THREE.Vector3(), true, 100)
  expect(point.intensity).toBe(200)
  lamps.update(new THREE.Vector3(), false, 100)
  expect(lights.every((light) => light.intensity === 0)).toBe(true)
  expect(root.children.filter((object) => object instanceof THREE.Light)).toEqual(lights)
  lamps.remove('near')
  lamps.remove('highway')
  lamps.update(new THREE.Vector3(), true, 100)
  expect(lights.every((light) => light.intensity === 0)).toBe(true)
  lamps.dispose()
  expect(root.children.some((object) => object instanceof THREE.Light)).toBe(false)
})
