import { expect, it } from 'vitest'
import { chartRoads } from '../playground/helm-map.js'
import { createEntity, parseScene } from './scene.js'
it('shares charts between screens and keeps bounds of a road crossing the complete viewport', () => {
  const group = createEntity('group', 'group', [100, 0, 50])
  const road = {
    ...createEntity('road', 'group'),
    parentId: group.id,
    road: {
      terrainId: 'ground',
      width: 5,
      paths: [
        [
          [-3000, 0, 0],
          [3000, 0, 0],
        ],
      ] as [number, number, number][][],
    },
  }
  const doc = parseScene({
    version: 1,
    name: 'Chart',
    entities: [createEntity('spawn', 'spawn'), createEntity('ground', 'terrain'), group, road],
  })
  const chart = chartRoads(doc)
  expect(chartRoads(doc)).toBe(chart)
  expect(chart[0].minX).toBe(-2900)
  expect(chart[0].maxX).toBe(3100)
  expect(chart[0].minZ).toBe(50)
  const next = { ...doc, entities: doc.entities.filter((e) => e.id !== road.id) }
  expect(chartRoads(next)).toHaveLength(0)
  expect(chartRoads(doc)).toBe(chart)
})
