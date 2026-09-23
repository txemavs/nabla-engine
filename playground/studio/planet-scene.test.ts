import { expect, it } from 'vitest'
import { createEntity, SceneGraph } from '../../src/scene.js'
import { createPlanetScene, planetaryScene } from './planet-scene.js'
it('removes generated context without losing authored children or their world poses', () => {
  const scene = createPlanetScene({ latitude: 43, longitude: -1, altitude: 0 }, 'Test')
  const frame = createEntity('world-buildings', 'group', [20, 0, 10])
  const building = createEntity('osm-generated', 'box')
  building.source = {
    provider: 'openstreetmap',
    id: 'way/1',
    retrievedAt: '2026-09-23',
    tags: { building: 'yes' },
  }
  building.parentId = frame.id
  const authored = createEntity('custom', 'box', [1, 2, 3])
  authored.parentId = frame.id
  scene.entities.push(frame, building, authored, createEntity('world-custom', 'box'))
  const pose = SceneGraph.fromValidated(scene).worldTransform(authored.id)
  const migrated = planetaryScene(scene)
  expect(migrated.entities.some((e) => e.id === building.id || e.id === frame.id)).toBe(false)
  expect(migrated.entities.find((e) => e.id === 'custom')!.transform).toEqual(pose)
  expect(migrated.entities.find((e) => e.id === 'custom')!.parentId).toBeNull()
  expect(migrated.entities.some((e) => e.id === 'world-custom')).toBe(true)
  expect(planetaryScene(migrated)).toBe(migrated)
})
