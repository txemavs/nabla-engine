import { expect, it, vi } from 'vitest'
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Scene,
  Vector3,
  TextureLoader,
  Texture,
} from 'three'
import { WorldEnvironment } from '../../src/render/planet/world-environment.js'
import type { GeographicView } from '../../src/render/planet/sky.js'
import { stormStrength, weatherHours } from '../../src/render/planet/weather.js'

it('dims direct storm light more than the ambient fill, and restores clear light without accumulating', () => {
  const sun = new DirectionalLight(),
    ambient = new AmbientLight()
  const textureLoader = vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(new Texture())
  const environment = new WorldEnvironment(new Scene(), sun, ambient)
  const sky = {
    atmosphere: { day: 1, space: 0, fog: false, color: new Color('white') },
    sunDirection: new Vector3(0, 1, 0),
    moonDirection: new Vector3(0, -1, 0),
    weatherStorm: 0,
  } as unknown as GeographicView
  environment.applyLighting(sky)
  const clear = { sun: sun.intensity, ambient: ambient.intensity }
  sky.weatherStorm = 1
  environment.applyLighting(sky)
  const wet = { sun: sun.intensity, ambient: ambient.intensity }
  expect(wet.sun / clear.sun).toBeLessThan(wet.ambient / clear.ambient)
  expect(wet.ambient).toBeGreaterThan(0)
  environment.applyLighting(sky)
  expect(sun.intensity).toBe(wet.sun)
  sky.weatherStorm = 0
  environment.applyLighting(sky)
  expect(sun.intensity).toBe(clear.sun)
  environment.dispose()
  textureLoader.mockRestore()
})

it('weather advances independently of solar time and linked clear skies do not create a storm', () => {
  expect(weatherHours(3600) - weatherHours(0)).toBe(1)
  expect(stormStrength(1, { linked: true, clouds: false, amount: 1, storm: 1 })).toBe(0)
  expect(stormStrength(1, { linked: false, clouds: false, amount: 0, storm: 0 })).toBeGreaterThan(0)
})
