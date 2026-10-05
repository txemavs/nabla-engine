import { it, expect } from 'vitest'
import { Vector3 } from 'three'
import {
  nearestLocality,
  nearestStreet,
  navigationLabel,
  setNavigationPlaces,
  setNavigationRoads,
} from '../../src/render/entity/navigation-places.js'
import type { NavigationRoad } from '../../src/render/entity/navigation-places.js'

function road(
  name: string,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  width = 6,
): NavigationRoad {
  return {
    name,
    points: [
      { x: x0, z: z0 },
      { x: x1, z: z1 },
    ],
    width,
    carriageway: true,
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1),
  }
}

it('uses loaded settlements without claiming distant places as current city', () => {
  setNavigationPlaces(() => [{ id: '1', text: 'Irún', position: new Vector3(0, 120, 0) }])
  expect(nearestLocality([50, 500, 30])).toBe('Irún')
  expect(nearestLocality([4000, 500, 0])).toBe('Cerca de Irún')
  expect(nearestLocality([25000, 0, 0])).toBe('Localidad sin datos')
  setNavigationPlaces(() => [])
})

it('prefers the named street under the car and falls back to the city', () => {
  setNavigationPlaces(() => [{ id: '1', text: 'Irun', position: new Vector3(0, 120, 0) }])
  setNavigationRoads(() => [road('Nafarroa hiribidea', -40, 0, 40, 0)])
  expect(nearestStreet([0, 0, 0])).toBe('Nafarroa hiribidea')
  expect(navigationLabel([0, 0, 0])).toBe('Nafarroa hiribidea')
  expect(nearestStreet([0, 0, 80])).toBeUndefined()
  expect(navigationLabel([0, 0, 80])).toBe('Irun')
  setNavigationRoads(() => [])
  expect(nearestStreet([12, 0, 1], [road('Masti-Loidi kalea', 0, 0, 30, 0)])).toBe(
    'Masti-Loidi kalea',
  )
  setNavigationRoads(() => [])
  setNavigationPlaces(() => [])
})
