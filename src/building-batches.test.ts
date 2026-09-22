import { expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3, Raycaster, Color } from 'three'
import { BuildingBatches } from '../playground/building-batches.js'
import { createEntity, parseScene } from './scene.js'
import { SceneEditor } from './editor.js'

function fixture() {
  const entities = Array.from({ length: 8 }, (_, i) => ({
    ...createEntity(`building-${i}`, 'solid', [i * 5, 2, 0]),
    source: {
      provider: 'openstreetmap' as const,
      id: `way/${i}`,
      retrievedAt: '2026-09-23',
      tags: { building: 'yes' },
    },
  }))
  const parent = new Group()
  parent.position.x = 12000
  const objects = new Map(
    entities.map((e, i) => {
      const object = new Group()
      object.position.fromArray(e.transform.position)
      object.add(
        new Mesh(
          new BoxGeometry(2, 4, 2),
          new MeshStandardMaterial({ color: i % 2 ? '#c75d4d' : '#009900' }),
        ),
      )
      parent.add(object)
      return [e.id, object] as const
    }),
  )
  const batch = new BuildingBatches()
  parent.add(batch.root)
  return { entities, objects, batch, parent }
}

it('combines colored buildings, preserves picking, shadows and coordinates after rebasing', () => {
  const { entities, objects, batch, parent } = fixture()
  const original = JSON.stringify(entities)
  batch.update(entities, objects, true, new Vector3(), 1000)
  expect(batch.root.children).toHaveLength(1)
  const mesh = batch.root.children[0] as Mesh
  expect(mesh.castShadow && mesh.receiveShadow).toBe(true)
  expect(mesh.geometry.getAttribute('position').count).toBe(8 * 36)
  const color = mesh.geometry.getAttribute('color')
  expect(color.getY(0)).toBeCloseTo(new Color('#009900').g)
  expect(color.getX(36)).toBeCloseTo(new Color('#c75d4d').r)
  mesh.geometry.computeBoundingBox()
  expect(mesh.geometry.boundingBox!.min.x).toBeCloseTo(-1)
  parent.position.x = -18000
  batch.update(entities, objects, true, new Vector3(), 1000)
  expect(batch.root.children[0]).toBe(mesh)
  const source = objects.get('building-0')!
  source.visible = false
  source.updateWorldMatrix(true, true)
  const ray = new Raycaster(new Vector3(-18000, 2, 10), new Vector3(0, 0, -1))
  expect(ray.intersectObject(source, true)).not.toHaveLength(0)
  expect(JSON.stringify(entities)).toBe(original)
  batch.dispose()
})

it('extracts editable exceptions and rebuilds only affected cells on streaming changes', () => {
  const { entities, objects, batch } = fixture()
  objects.get('building-7')!.position.x = 600
  batch.update(entities, objects, true, new Vector3(), 1000)
  expect(batch.pending).toBe(true)
  expect(batch.covers('building-7')).toBe(false)
  batch.update(entities, objects, true, new Vector3(), 1000)
  const distant = batch.root.children[1]
  const next = entities.map((e) => (e.id === 'building-0' ? { ...e, mapEditable: true } : e))
  batch.update(next, objects, true, new Vector3(), 1000)
  expect(batch.covers('building-0')).toBe(false)
  expect(batch.covers('building-1')).toBe(true)
  expect(batch.root.children).toContain(distant)
  batch.update(
    next.filter((e) => e.id !== 'building-7'),
    objects,
    true,
    new Vector3(),
    1000,
  )
  expect(batch.root.children).not.toContain(distant)
  batch.update(next, objects, false, new Vector3(), 1000)
  expect(batch.covers('building-1')).toBe(false)
  batch.dispose()
})

it('persists an editable exception with its original OSM identity and supports undo', () => {
  const { entities, batch } = fixture()
  const editor = new SceneEditor({
    version: 1,
    name: 'Map',
    entities: [...entities, createEntity('spawn', 'spawn')],
  })
  editor.update('building-0', { mapEditable: true })
  const saved = parseScene(JSON.parse(JSON.stringify(editor.document)))
  expect(saved.entities[0].mapEditable).toBe(true)
  expect(saved.entities[0].source?.id).toBe('way/0')
  expect(saved.entities.filter((e) => e.source?.id === 'way/0')).toHaveLength(1)
  editor.undo()
  expect(editor.document.entities[0].mapEditable).toBeUndefined()
  batch.dispose()
})
