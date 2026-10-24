import { afterEach, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { OwnedProvider } from '../../src/render/entity/owned-provider.js'
import {
  navigationPlaces,
  navigationRoads,
  registerNavigationPlaces,
  registerNavigationRoads,
  setNavigationPlaces,
  setNavigationRoads,
} from '../../src/render/entity/navigation-places.js'

afterEach(() => {
  setNavigationPlaces(() => [])
  setNavigationRoads(() => [])
})
it.each([true, false])(
  'releases owners in either order without reviving dead providers (%s)',
  (oldestFirst) => {
    const provider = new OwnedProvider<() => string>(() => 'fallback')
    const a = provider.register(() => 'a'),
      b = provider.register(() => 'b')
    expect(provider.value()).toBe('b')
    if (oldestFirst) {
      a()
      expect(provider.value()).toBe('b')
      b()
    } else {
      b()
      expect(provider.value()).toBe('a')
      a()
    }
    a()
    b()
    expect(provider.value()).toBe('fallback')
  },
)
it('keeps legacy setters authoritative despite pending releases', () => {
  const provider = new OwnedProvider('initial'),
    release = provider.register('runtime')
  provider.set('host')
  release()
  expect(provider.value).toBe('host')
  const releaseNext = provider.register('next')
  releaseNext()
  expect(provider.value).toBe('host')
})
it('removes only owned navigation sources and restores the previous live runtime', () => {
  const place = (id: string) => ({ id, text: id, position: new Vector3() })
  const a = registerNavigationPlaces(() => [place('a')])
  const b = registerNavigationPlaces(() => [place('b')])
  expect(navigationPlaces()[0].id).toBe('b')
  a()
  expect(navigationPlaces()[0].id).toBe('b')
  b()
  expect(navigationPlaces()).toEqual([])
  let calls = 0
  const road = registerNavigationRoads(() => {
    calls++
    return []
  })
  navigationRoads()
  road()
  navigationRoads()
  expect(calls).toBe(1)
})
