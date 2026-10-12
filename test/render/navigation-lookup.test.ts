import { expect, it, vi } from 'vitest'
import { Vector3 } from 'three'
import {
  NavigationPlaceLookup,
  setNavigationPlaces,
  setNavigationRoads,
} from '../../src/render/entity/navigation-places.js'
it('defers and coalesces HUD queries and discards work after reset', async () => {
  vi.useFakeTimers()
  const provider = vi.fn(() => [{ id: 'town', text: 'Bilbao', position: new Vector3() }])
  setNavigationPlaces(provider)
  setNavigationRoads(() => [])
  const lookup = new NavigationPlaceLookup(),
    apply = vi.fn()
  lookup.request([0, 0, 0], apply)
  lookup.request([1, 0, 0], apply)
  expect(provider).not.toHaveBeenCalled()
  await vi.runAllTimersAsync()
  expect(provider).toHaveBeenCalledTimes(1)
  expect(apply).toHaveBeenCalledWith('Bilbao', '')
  lookup.reset()
  apply.mockClear()
  lookup.request([0, 0, 0], apply)
  lookup.reset()
  await vi.runAllTimersAsync()
  expect(apply).not.toHaveBeenCalled()
  setNavigationPlaces(() => [])
  vi.useRealTimers()
})
