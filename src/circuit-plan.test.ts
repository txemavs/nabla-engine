import { expect, it } from 'vitest'
import { alignCircuitPlan, CIRCUIT_PLOTS, circuitPoint } from './circuit-plan.js'
import { createSampleScene } from './sample.js'
import { createEntity, parseScene } from './scene.js'

it('fits the building footprints to all surveyed JPEG parcels and preserves user additions', () => {
  const doc = createSampleScene()
  expect(doc.entities.filter((e) => /^building-\d+$/.test(e.id))).toHaveLength(CIRCUIT_PLOTS.length)
  CIRCUIT_PLOTS.forEach(([x0, y0, x1, y1], i) => {
    const e = doc.entities.find((e) => e.id === `building-${i}`)!,
      a = circuitPoint(x0, y0),
      b = circuitPoint(x1, y1)
    expect(e.transform.position[0] - e.size[0] / 2).toBeCloseTo(a[0], 6)
    expect(e.transform.position[2] + e.size[2] / 2).toBeCloseTo(b[2], 6)
  })
  expect(doc.entities.some((e) => e.id === 'road')).toBe(false)
  const custom = createEntity('my-building', 'box', [40, 3, 40])
  doc.entities.push(custom)
  expect(alignCircuitPlan(doc).entities.find((e) => e.id === 'my-building')).toEqual(custom)
  expect(alignCircuitPlan(alignCircuitPlan(doc))).toEqual(alignCircuitPlan(doc))
})
it('validates transparent sprite data independently from physical entities', () => {
  const doc = createSampleScene(),
    tree = doc.entities.find((e) => e.sprite)!
  expect(parseScene(doc).entities.find((e) => e.id === tree.id)!.sprite?.url).toBe(
    '/sprites/tree-1.png',
  )
  tree.sprite!.url = 'https://example.com/tree.png'
  expect(() => parseScene(doc)).toThrow()
  tree.sprite!.url = '/sprites/tree.png'
  tree.motion = 'dynamic'
  expect(() => parseScene(doc)).toThrow()
})
