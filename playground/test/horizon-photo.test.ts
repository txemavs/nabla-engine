import { expect, it } from 'vitest'
import { previewWater, reliefWaterQuads } from '../planet-horizon.js'

it('treats the preview fill as water and leaves a photographed coast', () => {
  expect(previewWater(0x0c, 0x21, 0x04)).toBe(true)
  expect(previewWater(0x0c, 0x21, 0x06)).toBe(true)
  expect(previewWater(0x78, 0x50, 0x21)).toBe(false)
  expect(previewWater(0x1a, 0x22, 0x09)).toBe(false)
  const data = new Uint8Array(32 * 32 * 4).fill(0)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0x0c
    data[i + 1] = 0x21
    data[i + 2] = 0x04
  }
  data[0] = 0x78
  data[1] = 0x50
  data[2] = 0x21
  const water = reliefWaterQuads({ width: 32, height: 32, data })
  expect(water.has(0)).toBe(false)
  expect(water.size).toBe(32 * 32 - 1)
})
