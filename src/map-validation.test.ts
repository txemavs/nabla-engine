import { expect, it, vi } from 'vitest'
import { createEntity, parseScene, replaceMapScene } from './scene.js'
import * as solid from './solid.js'

it('checks incoming topology once and preserves validated resident geometry', () => {
  const doc = parseScene({
    version: 1,
    name: 'Streaming',
    entities: [createEntity('spawn', 'spawn'), createEntity('old', 'solid')],
  })
  const check = vi.spyOn(solid, 'validateSolid')
  const next = replaceMapScene(doc, new Set(), [createEntity('new', 'solid')])
  expect(check).toHaveBeenCalledTimes(1)
  expect(next.entities[1]).toBe(doc.entities[1])
  expect(next.entities[1].geometry).toBe(doc.entities[1].geometry)
  check.mockRestore()
})

it('still rejects invalid topology, duplicate IDs and dangling references atomically', () => {
  const ground = createEntity('ground', 'terrain')
  const road = {
    ...createEntity('road', 'group'),
    road: {
      terrainId: 'ground',
      width: 2,
      paths: [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
      ] as [number, number, number][][],
    },
  }
  const doc = parseScene({
    version: 1,
    name: 'Streaming',
    entities: [createEntity('spawn', 'spawn'), ground, road],
  })
  const before = JSON.stringify(doc)
  expect(() => replaceMapScene(doc, new Set(['ground']), [])).toThrow('terrain reference')
  expect(() => replaceMapScene(doc, new Set(), [ground])).toThrow('Duplicate')
  const bad = createEntity('bad', 'solid')
  bad.geometry!.faces[0] = [999, 1, 2]
  expect(() => replaceMapScene(doc, new Set(), [bad])).toThrow()
  expect(JSON.stringify(doc)).toBe(before)
})
