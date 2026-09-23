import { it, expect } from 'vitest'
import { Vector3 } from 'three'
import { nearestLocality, setNavigationPlaces } from './navigation-places.js'
it('uses loaded settlements without claiming distant places as current city', () => {
  setNavigationPlaces(() => [{ id: '1', text: 'Irún', position: new Vector3(0, 120, 0) }])
  expect(nearestLocality([50, 500, 30])).toBe('Irún')
  expect(nearestLocality([4000, 500, 0])).toBe('Cerca de Irún')
  expect(nearestLocality([25000, 0, 0])).toBe('Localidad sin datos')
  setNavigationPlaces(() => [])
})
