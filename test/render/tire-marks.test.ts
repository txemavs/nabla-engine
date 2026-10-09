import { expect, it } from 'vitest'
import { Vector3, BufferAttribute } from 'three'
import { TireMarks, type TireMarkContact } from '../../src/render/entity/tire-marks.js'
const contact = (x: number, slip = 1): TireMarkContact => ({
  contactPoint: [1000000 + x, 10, 0],
  contactNormal: [0, 1, 0],
  slip,
})
it('bounds marks, preserves floating-origin placement, and fades without geometry uploads', () => {
  const marks = new TireMarks(4, 20),
    origin = new Vector3(1000000, 0, 0)
  for (let x = 0; x < 10; x++) marks.update(0.06, 'car', [contact(x)], origin)
  expect(marks.root.geometry.drawRange.count).toBe(24)
  expect(marks.root.position.x).toBe(0)
  expect(marks.root.visible).toBe(true)
  const positions = marks.root.geometry.attributes.position as BufferAttribute
  expect(Math.max(...Array.from(positions.array))).toBeLessThan(20)
  const version = positions.version
  marks.update(21, null, [], origin.clone().add(new Vector3(50, 0, 0)))
  expect(marks.root.visible).toBe(false)
  expect(positions.version).toBe(version)
  expect(marks.root.position.x).toBe(-50)
  marks.dispose()
})
it('breaks on airborne wheels, teleports and vehicle changes, and ignores ordinary rolling', () => {
  const marks = new TireMarks(),
    origin = new Vector3()
  marks.update(0.1, 'a', [contact(0, 0)], origin)
  marks.update(0.1, 'a', [contact(1, 0)], origin)
  expect(marks.root.geometry.drawRange.count).toBe(0)
  marks.update(0.1, 'a', [contact(1)], origin)
  marks.update(0.1, 'a', [contact(2)], origin)
  expect(marks.root.geometry.drawRange.count).toBe(6)
  marks.update(0.01, 'a', [{ contactPoint: null, contactNormal: null, slip: 0 }], origin)
  marks.update(0.1, 'a', [contact(3)], origin)
  marks.update(0.1, 'a', [contact(100)], origin)
  marks.update(0.1, 'b', [contact(101)], origin)
  expect(marks.root.geometry.drawRange.count).toBe(6)
  marks.clear()
  expect(marks.root.geometry.drawRange.count).toBe(0)
  marks.dispose()
})

it('paints a grass slide brown-green, including a lighter slide than asphalt', () => {
  const marks = new TireMarks(),
    origin = new Vector3()
  const grass = (x: number): TireMarkContact => ({ ...contact(x, 0.15), surface: 'grass' })
  marks.update(0.1, 'a', [grass(0)], origin)
  marks.update(0.1, 'a', [grass(1)], origin)
  expect(marks.root.geometry.drawRange.count).toBe(6)
  const tint = marks.root.geometry.attributes.tint as BufferAttribute
  expect(tint.getY(0)).toBeGreaterThan(0.2)
  expect(tint.getY(0)).toBeGreaterThan(tint.getX(0))
  marks.dispose()
})
