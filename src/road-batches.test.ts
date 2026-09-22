import { expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { RoadBatches } from '../playground/road-batches.js'
import { createEntity } from './scene.js'

it('batches immutable authored roads, preserves offsets, culls and returns to edit mode', () => {
  const entities = [0, 1].map((i) => ({
    ...createEntity(`road-${i}`, 'group', [i * 10, 0, 0]),
    road: {
      paths: [
        [
          [0, 0, 0],
          [10, 0, 0],
        ] as [number, number, number][],
      ],
      width: 5,
      terrainId: 'ground',
    },
    source: {
      provider: 'openstreetmap' as const,
      id: `way/${i}`,
      retrievedAt: '2026-09-22',
      tags: {},
    },
  }))
  const original = JSON.stringify(entities)
  const objects = new Map(
    entities.map((e, i) => {
      const g = new Group()
      g.position.set(i * 10, 2, 0)
      const m = new Mesh(new BoxGeometry(10, 0.02, 5), new MeshStandardMaterial())
      m.position.y = -0.01
      g.add(m)
      return [e.id, g] as const
    }),
  )
  const batch = new RoadBatches()
  batch.update(entities, objects, true, new Vector3(), 500)
  expect(batch.root.children).toHaveLength(1)
  const mesh = batch.root.children[0] as Mesh
  mesh.geometry.computeBoundingBox()
  expect(mesh.geometry.boundingBox!.min.y).toBeCloseTo(1.98)
  expect(mesh.geometry.boundingBox!.max.x).toBeCloseTo(15)
  expect(mesh.geometry.index!.count).toBe(72)
  expect(JSON.stringify(entities)).toBe(original)
  batch.update(entities, objects, true, new Vector3(10000, 0, 0), 250)
  expect(mesh.visible).toBe(false)
  batch.update(entities, objects, false, new Vector3(), 250)
  expect(batch.root.visible).toBe(false)
  let disposed = false
  mesh.geometry.addEventListener('dispose', () => {
    disposed = true
  })
  batch.update(entities.slice(0, 1), objects, true, new Vector3(), 250)
  expect(disposed).toBe(true)
  expect((batch.root.children[0] as Mesh).geometry.index!.count).toBe(36)
  batch.dispose()
  expect(batch.root.children).toHaveLength(0)
})
