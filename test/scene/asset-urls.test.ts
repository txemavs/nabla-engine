import { expect, it } from 'vitest'
import { parseScene } from '../../src/scene/document.js'
import { createSampleScene } from '../../src/scene/sample.js'
import { migrateStockAssetUrls } from '../../src/scene/asset-urls.js'

it('loads old stock URLs without changing the caller scene or vehicle tuning', () => {
  const scene = createSampleScene()
  const car = scene.entities.find((entity) => entity.vehicle && entity.visual?.body)!
  car.visual!.body.url = '/studio/cars/a3/a3.cabrio.glb'
  const mass = car.mass
  const result = parseScene(scene).entities.find((entity) => entity.id === car.id)!
  expect(result.visual!.body.url).toBe('/library/cars/a3/a3.cabrio.glb')
  expect(result.mass).toBe(mass)
  expect(car.visual!.body.url).toBe('/studio/cars/a3/a3.cabrio.glb')
})

it('does not rewrite names, custom paths or external URLs', () => {
  const values = {
    name: '/studio/cars/a3',
    url: 'https://example.com/studio/cars/a3.glb',
    custom: { url: '/custom/cars/a3.glb' },
    truck: { url: '/studio/trucks/white-truck-studio/assets/tractor.modern.glb' },
  }
  migrateStockAssetUrls(values)
  expect(values.name).toBe('/studio/cars/a3')
  expect(values.url).toBe('https://example.com/studio/cars/a3.glb')
  expect(values.custom.url).toBe('/custom/cars/a3.glb')
  expect(values.truck.url).toBe('/library/trucks/white-truck/assets/tractor.modern.glb')
})
