import { expect, test } from 'vitest'
import { planetCellAt, planetCellBounds } from './planet-grid.js'
test('planet identity depends only on geographic position', () => {
  const p = { latitude: 41.5033, longitude: -5.7446 }
  const id = planetCellAt(p)
  expect(planetCellAt({ ...p, longitude: p.longitude + 360 })).toBe(id)
  expect(planetCellAt(planetCellBounds(id).center)).toBe(id)
  expect(planetCellAt({ latitude: 43.32969, longitude: -1.819606 })).not.toBe(id)
})
test('bounds roundtrip across the world including poles and dateline', () => {
  for (const latitude of [-90, -89.99, -80, 0, 43, 80, 89.99, 90])
    for (const longitude of [-180, -179.99, 0, 179.99, 180]) {
      const id = planetCellAt({ latitude, longitude })
      expect(planetCellAt(planetCellBounds(id).center)).toBe(id)
    }
  expect(planetCellAt({ latitude: 90, longitude: 70 })).toBe(
    planetCellAt({ latitude: 90, longitude: -80 }),
  )
  expect(() => planetCellAt({ latitude: 91, longitude: 0 })).toThrow()
  expect(() => planetCellBounds('earth-bands-v1/999999/0')).toThrow()
})
