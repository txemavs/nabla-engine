import { expect, it } from 'vitest'
import { oceanGeometry, SEA_ALTITUDE } from '../../src/render/planet/ocean-sheet.js'
import { EARTH_RADIUS } from '../../src/math/geo/sphere.js'
it('keeps the whole sea at buoyancy altitude with a fixed triangle budget', () => {
  for (const reach of [2000, 22000, 120000]) {
    const geometry = oceanGeometry(reach),
      p = geometry.getAttribute('position')
    expect((geometry.index?.count ?? 0) / 3).toBeLessThan(13000)
    for (let i = 0; i < p.count; i++)
      expect(
        Math.abs(
          Math.hypot(p.getX(i), p.getY(i) + EARTH_RADIUS + SEA_ALTITUDE, p.getZ(i)) -
            EARTH_RADIUS -
            SEA_ALTITUDE,
        ),
      ).toBeLessThan(0.002)
    expect(p.getY(p.count - 1)).toBeLessThan((-reach * reach) / (2 * (EARTH_RADIUS + 1)))
    geometry.dispose()
  }
})
