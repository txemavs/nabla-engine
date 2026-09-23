import { expect, it } from 'vitest'
import { ShapeUtils } from 'three'
import { buildingFootprints } from './building-footprints.js'
import type { MapFeature } from './real-world.js'
const box = (id: string, x: number, width: number, tags: Record<string, string>): MapFeature => ({
  id,
  tags,
  rings: [
    {
      role: 'outer',
      coordinates: [
        [x, 0],
        [x + width, 0],
        [x + width, 10],
        [x, 10],
        [x, 0],
      ],
    },
  ],
})
const project = ([x, y]: [number, number]): [number, number, number] => [x, 0, y]
const area = (
  polygons: ReturnType<typeof buildingFootprints> extends Map<string, infer P> ? P : never,
) =>
  polygons.reduce(
    (s, p) =>
      s +
      Math.abs(ShapeUtils.area(p.contour)) -
      p.holes.reduce((a, h) => a + Math.abs(ShapeUtils.area(h)), 0),
    0,
  )
it('replaces the generic outline with its detailed parts without duplicate roof caps', () => {
  const result = buildingFootprints(
    [
      box('outline', 0, 20, { building: 'yes' }),
      box('left', 0, 10, { 'building:part': 'yes' }),
      box('right', 10, 10, { 'building:part': 'yes', min_height: '6' }),
    ],
    project,
  )
  expect(result.get('outline')).toEqual([])
  expect(area(result.get('left')!)).toBe(100)
  expect(area(result.get('right')!)).toBe(100)
})
it('preserves uncovered outline and ignores a neighboring part crossing its boundary', () => {
  const features = [
    box('outline', 0, 20, { building: 'yes' }),
    box('part', 0, 5, { 'building:part': 'yes' }),
    box('neighbor', 15, 10, { 'building:part': 'yes' }),
  ]
  const before = JSON.stringify(features)
  const result = buildingFootprints(features, project)
  expect(area(result.get('outline')!)).toBe(150)
  expect(JSON.stringify(features)).toBe(before)
})
