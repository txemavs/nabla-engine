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

function roadFixture(count: number) {
  const entities = Array.from({ length: count }, (_, i) => ({
    ...createEntity(`road-${i}`, 'group', [i * 256 + 20, 0, 0]),
    road: {
      paths: [
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
      ] as [number, number, number][][],
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
  const objects = new Map(
    entities.map((e) => {
      const group = new Group()
      group.position.fromArray(e.transform.position)
      group.add(new Mesh(new BoxGeometry(10, 0.02, 5), new MeshStandardMaterial()))
      return [e.id, group] as const
    }),
  )
  return { entities, objects }
}

it('keeps all 800 resident cell buffers when another sector arrives and leaves', () => {
  const { entities, objects } = roadFixture(801)
  const batch = new RoadBatches()
  const eye = new Vector3()
  batch.update(entities.slice(0, 800), objects, true, eye, 4000)
  const resident = [...batch.root.children]
  let disposed = 0
  resident.forEach((m) => (m as Mesh).geometry.addEventListener('dispose', () => disposed++))
  batch.update(entities, objects, true, eye, 4000)
  expect(batch.root.children).toHaveLength(801)
  expect(batch.root.children.slice(0, 800)).toEqual(resident)
  expect(disposed).toBe(0)
  batch.update(entities.slice(0, 800), objects, true, eye, 4000)
  expect(batch.root.children).toEqual(resident)
  expect(disposed).toBe(0)
  batch.dispose()
  expect(disposed).toBe(800)
})

it('rebuilds only an edited cell and removes the previous cell when a road moves', () => {
  const { entities, objects } = roadFixture(3)
  const batch = new RoadBatches()
  const eye = new Vector3()
  batch.update(entities, objects, true, eye, 4000)
  const retained = batch.root.children.slice(1)
  const changed = { ...entities[0], color: '#ff0000' }
  objects.get(changed.id)!.position.x = 1024
  batch.update([changed, ...entities.slice(1)], objects, true, eye, 4000)
  expect(batch.root.children).toHaveLength(3)
  expect(batch.root.children.slice(0, 2)).toEqual(retained)
  const edited = batch.root.children[2] as Mesh
  expect(edited.geometry.boundingSphere!.center.x).toBeCloseTo(1024)
  expect((edited.material as MeshStandardMaterial).color.getHexString()).toBe('ff0000')
  batch.dispose()
})

it('defers hidden road geometry and reconciles streaming changes when enabled again', () => {
  const { entities, objects } = roadFixture(3)
  const batch = new RoadBatches()
  const eye = new Vector3()
  batch.update(entities, objects, true, eye, 0)
  expect(batch.root.children).toHaveLength(0)
  batch.update(entities, objects, true, eye, 4000)
  const retained = batch.root.children[1]
  batch.update(entities.slice(1), objects, true, eye, 0)
  expect(batch.root.visible).toBe(false)
  batch.update(entities.slice(1), objects, true, eye, 4000)
  expect(batch.root.children).toHaveLength(2)
  expect(batch.root.children[0]).toBe(retained)
  batch.dispose()
})
