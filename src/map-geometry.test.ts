import { expect, it } from 'vitest'
import { createEntity, type Entity } from './scene.js'
import { roadGeometry } from './draped-road.js'
import { terrainVertices, terrainIndices } from './terrain.js'
import {
  prepareMapGeometry,
  mapGeometryTransfers,
  receiveMapGeometry,
  takeMapGeometry,
} from '../playground/map-geometry.js'

it('transfers terrain and draped roads without changing their surface or copying buffers on adoption', () => {
  const terrain = { columns: 3, rows: 3, spacing: 10, heights: [0, 3, 0, 6, 1, 5, 2, 8, 1] }
  const road = {
    terrainId: 'terrain',
    width: 2,
    paths: [
      [
        [-8, 0, -7],
        [7, 0, 8],
      ],
    ] as [number, number, number][][],
  }
  const entities: Entity[] = [
    { ...createEntity('terrain', 'terrain'), terrain },
    { ...createEntity('road', 'group'), road },
  ]
  const serialized = JSON.stringify(entities)
  const buffers = prepareMapGeometry(entities)
  const expected = roadGeometry(terrain, road.paths, road.width)
  expect([...buffers.road.position]).toEqual([...new Float32Array(expected.vertices.flat())])
  expect([...buffers.road.index!]).toEqual(expected.faces.flat())
  expect([...buffers.terrain.position]).toEqual(terrainVertices(terrain).flat())
  expect([...buffers.terrain.index!]).toEqual(terrainIndices(terrain))
  const moved = structuredClone(buffers, { transfer: mapGeometryTransfers(buffers) })
  expect(buffers.road.position.byteLength).toBe(0)
  expect(moved.road.normal.every(Number.isFinite)).toBe(true)
  receiveMapGeometry(entities, moved)
  const mesh = takeMapGeometry(entities[1])!
  expect(mesh.getAttribute('position').array).toBe(moved.road.position)
  expect(mesh.index!.array).toBe(moved.road.index)
  expect(takeMapGeometry(entities[1])).toBeUndefined()
  expect(JSON.stringify(entities)).toBe(serialized)
  mesh.dispose()
  takeMapGeometry(entities[0])!.dispose()
})

it('leaves external terrain references to the renderer and prepares building normals', () => {
  const entities: Entity[] = [
    { ...createEntity('road', 'group'), road: { terrainId: 'elsewhere', width: 2, paths: [] } },
    {
      ...createEntity('building', 'solid'),
      geometry: {
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        edges: [],
        faces: [[0, 1, 2]],
      },
    },
  ]
  const buffers = prepareMapGeometry(entities)
  expect(buffers.road).toBeUndefined()
  expect([...buffers.building.normal]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1])
  expect(buffers.building.index).toBeUndefined()
  expect(mapGeometryTransfers(buffers)).toHaveLength(2)
})
