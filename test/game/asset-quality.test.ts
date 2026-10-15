import { expect, it } from 'vitest'
import { assetQualityForDevice, assetUrlForQuality } from '../../src/render/entity/asset-quality.js'
import { visualField } from '../../src/entity/vehicle/field.js'

it('uses low variants on low profiles and Quest, retaining full desktop quality', () => {
  const part = { url: '/bike.glb', lowUrl: '/bike-low.glb' }
  for (const preset of ['minimal', 'mobile', 'low'])
    expect(assetUrlForQuality(part, assetQualityForDevice(preset))).toBe('/bike-low.glb')
  expect(assetQualityForDevice('high', 'Mozilla OculusBrowser/36 Quest 3')).toBe('low')
  for (const preset of ['balanced', 'high', 'ultra', 'custom'])
    expect(assetUrlForQuality(part, assetQualityForDevice(preset, 'Chrome'))).toBe('/bike.glb')
  expect(assetUrlForQuality({ url: '/other.glb' }, 'low')).toBe('/other.glb')
})

it('preserves variant declarations in the scene schema and rejects external URLs', () => {
  const body = {
    url: '/bike.glb',
    lowUrl: '/bike-low.glb',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
  }
  expect(visualField.parse({ body }).body.lowUrl).toBe('/bike-low.glb')
  expect(
    visualField.safeParse({ body: { ...body, lowUrl: 'https://example.com/a.glb' } }).success,
  ).toBe(false)
})
