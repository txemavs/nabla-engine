import { describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'

describe('white-truck chase camera', () => {
  it('keeps the far trailer framing even without a trailer hitched', () => {
    const tractor = presetVehicle('white-truck', 'tractor').vehicle!
    expect(tractor.cameraDistance).toBe(24)
    for (const trailer of ['white-trailer', 'white-trailer-chassis'])
      expect(tractor.cameraDistance).toBeGreaterThanOrEqual(
        presetVehicle(trailer, trailer).vehicle!.cameraDistance,
      )
  })
})
