import { expect, it } from 'vitest'
import * as THREE from 'three'
import { createCatalogEntities, entityCatalog } from '../../src/catalog/palette.js'
import { vehiclePreset } from '../../src/catalog/vehicles/library.js'
import { entityCapabilities } from '../../src/entity/capability.js'
import { createEntity } from '../../src/entity/schema.js'
import { parseScene } from '../../src/scene/document.js'
import { SceneEditor } from '../../src/scene/history.js'
import { Streetlights } from '../../src/render/entity/streetlights.js'

it('loads the previous A3 and the current S3 as separate presets', () => {
  const ids = entityCatalog.map((entry) => entry.id)
  for (const id of ['car', 'a3', 'carrier', 'streetlight', 'globe']) expect(ids).toContain(id)
  expect(ids.indexOf('car')).toBeLessThan(ids.indexOf('a3'))
  const s3 = vehiclePreset('car')
  const a3 = vehiclePreset('a3')
  expect(s3.vehicle.powertrain?.powerCv).toBe(400)
  expect(s3.visual.presentation).toBe('nabla.s3')
  expect(a3.name).toBe('A3 Cabrio')
  expect(a3.vehicle.powertrain).toBeUndefined()
  expect(a3.vehicle.brakeForce).toBe(36)
  expect(a3.visual.presentation).toBeUndefined()
  expect(createCatalogEntities('a3', 'old', [0, 0, 0])[0].transform.position[1]).toBeCloseTo(0.62)
})

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
    // Explicit budget: the default street-light set is disabled for now (lightingDefaults).
    lamps = new Streetlights(root, { spots: 6, points: 6 })
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
  lamps.update(new THREE.Vector3(), true, 100)
  const lights = root.children.filter((o): o is THREE.SpotLight => o instanceof THREE.SpotLight)
  expect(lights).toHaveLength(6)
  expect(lights.every((l) => l.intensity > 0 && !l.castShadow)).toBe(true)
  lamps.update(new THREE.Vector3(), false, 100)
  expect(lights.every((l) => l.intensity === 0)).toBe(true)
  lamps.update(new THREE.Vector3(1000, 0, 0), true, 100)
  expect(lights.every((l) => l.intensity === 0)).toBe(true)
})
