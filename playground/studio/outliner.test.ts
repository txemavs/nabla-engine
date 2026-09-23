import { expect, test } from 'vitest'
import { createEntity } from '../../src/scene.js'
import { authoredTree } from './outliner.js'

test('generated context stays out; a customized child appears without changing its parent', () => {
  const group = createEntity('world-trees', 'group')
  const trees = Array.from({ length: 10000 }, (_, i) => ({
    ...createEntity('tree-' + i, 'group'),
    parentId: group.id,
    source: {
      provider: 'openstreetmap' as const,
      id: 'node/' + i,
      retrievedAt: '2026-09-23',
      tags: { natural: 'tree' },
    },
  }))
  trees[50].mapEditable = true
  const car = createEntity('car', 'vehicle')
  const wheel = { ...createEntity('wheel', 'box'), parentId: car.id }
  const result = authoredTree([group, ...trees, car, wheel])
  expect(result.get(null)?.map((e) => e.id)).toEqual(['tree-50', 'car'])
  expect(result.get(car.id)).toEqual([wheel])
  expect(trees[50].parentId).toBe('world-trees')
})
