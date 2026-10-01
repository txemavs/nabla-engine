import { expect, it } from 'vitest'
import { catchFloorGrid } from '../../src/render/planet/catch-floor.js'

const identity: [number, number, number, number] = [0, 0, 0, 1]

it('draws a 100 m grid with the editor axis colors on the origin cross', () => {
  const geometry = catchFloorGrid([0, -30, 0], identity, 250)
  const position = geometry.getAttribute('position')
  const color = geometry.getAttribute('color')
  const samples: { x: number; z: number; color: [number, number, number] }[] = []
  for (let i = 0; i < position.count; i++)
    samples.push({
      x: position.getX(i),
      z: position.getZ(i),
      color: [color.getX(i), color.getY(i), color.getZ(i)],
    })
  const northSouth = samples.filter((p) => Math.abs(p.z) > 30)
  const blue = northSouth.filter((p) => Math.abs(p.x) < 0.6)
  const black = northSouth.filter((p) => Math.abs(p.x - 100) < 0.4)
  const red = samples.filter((p) => Math.abs(p.z) < 0.6 && Math.abs(p.x) > 30)
  expect(blue.length).toBeGreaterThan(0)
  expect(red.length).toBeGreaterThan(0)
  expect(black.length).toBeGreaterThan(0)
  expect(blue.every((p) => p.color[2] > p.color[0] && p.color[2] > p.color[1])).toBe(true)
  expect(red.every((p) => p.color[0] > p.color[1] && p.color[0] > p.color[2])).toBe(true)
  expect(black.every((p) => p.color[0] < 0.05 && p.color[1] < 0.05 && p.color[2] < 0.05)).toBe(true)
  expect(northSouth.some((p) => Math.abs(Math.abs(p.x) - 10) < 0.15)).toBe(false)
  expect(northSouth.some((p) => Math.abs(Math.abs(p.x) - 50) < 0.15)).toBe(false)
  const span = (points: { x: number }[]) =>
    Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x))
  expect(span(blue)).toBeGreaterThan(span(black) + 0.3)
  geometry.dispose()
})
