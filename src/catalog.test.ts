import { expect, it } from 'vitest'
import * as THREE from 'three'
import { createCatalogEntities } from './catalog.js'
import { entityCapabilities } from './capabilities.js'
import { createEntity, parseScene } from './scene.js'
import { SceneEditor } from './editor.js'
import { Streetlights } from '../playground/streetlights.js'

it('creates independently editable vehicles with remapped portals when cloned', () => {
  const entities = createCatalogEntities('carrier', 'ship', [10, 20, 30])
  const car = createCatalogEntities('car', 'car', [0, 20, 0])[0]
  expect(entityCapabilities(entities[0])).toEqual(
    expect.arrayContaining(['drive', 'fly', 'interior', 'dock']),
  )
  expect(entityCapabilities(car)).toContain('drive')
  expect(entityCapabilities(car)).not.toContain('fly')
  expect(car.transform.position[1]).toBeCloseTo(20.62)
  const editor = new SceneEditor(
    parseScene({
      version: 1,
      name: 'Catalog',
      entities: [createEntity('spawn', 'spawn'), ...entities, car],
    }),
  )
  const copy = editor.duplicate('ship')
  const children = editor.document.entities.filter((e) => e.parentId === copy)
  expect(children).toHaveLength(1)
  expect(children[0].portal).toBeDefined()
  expect(children[0].id).not.toBe(entities[1].id)
})

it('serializes lamp controls and caps nearby night illumination at six shadowless spots', () => {
  const root = new THREE.Group(),
    lamps = new Streetlights(root)
  for (let i = 0; i < 9; i++) {
    const e = createCatalogEntities('streetlight', `lamp-${i}`, [i * 2, 0, 0])[0]
    expect(entityCapabilities(e)).toContain('light')
    const group = new THREE.Group()
    group.position.fromArray(e.transform.position)
    root.add(group)
    lamps.add(e, group)
    const saved = parseScene({
      version: 1,
      name: 'Lamp',
      entities: [createEntity('spawn', 'spawn'), e],
    })
    expect(saved.entities[1].light).toEqual(e.light)
  }
  lamps.update(new THREE.Vector3(), true)
  const lights = root.children.filter((o): o is THREE.SpotLight => o instanceof THREE.SpotLight)
  expect(lights).toHaveLength(6)
  expect(lights.every((l) => l.intensity > 0 && !l.castShadow)).toBe(true)
  lamps.update(new THREE.Vector3(), false)
  expect(lights.every((l) => l.intensity === 0)).toBe(true)
  lamps.update(new THREE.Vector3(1000, 0, 0), true)
  expect(lights.every((l) => l.intensity === 0)).toBe(true)
})
