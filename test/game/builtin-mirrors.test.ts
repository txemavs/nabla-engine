import { describe, expect, it } from 'vitest'
import {
  BUILTIN_HOST_MIRRORS,
  builtinHostMirrors,
  viteHostMirrors,
} from '../../game/host-mirrors.js'
import { centredRange, MIRROR_RANGE, MIRROR_SPAN } from '../../game/mirror-controls.js'

describe('built-in mirror defaults (Txema 2026-10-09)', () => {
  it('ships the S3, white truck and VFR values a fresh browser shows', () => {
    expect(BUILTIN_HOST_MIRRORS.car).toEqual({
      left: { yaw: -5, tilt: 0 },
      right: { yaw: -9, tilt: -4 },
    })
    expect(BUILTIN_HOST_MIRRORS['white-truck'].right).toEqual({ yaw: 0, tilt: 1.5 })
    expect(BUILTIN_HOST_MIRRORS.vfr800).toEqual({
      left: { yaw: -12.5, tilt: -1.5 },
      right: { yaw: -14.5, tilt: -1.5 },
    })
    expect(Object.keys(builtinHostMirrors()).length).toBeGreaterThanOrEqual(3)
    expect(viteHostMirrors()).toEqual(builtinHostMirrors())
  })

  it('centres each slider on its default, ±9°, inside the engine limits', () => {
    expect(MIRROR_SPAN).toBe(9)
    expect(centredRange(-14.5, MIRROR_RANGE.yaw)).toEqual({ min: -23.5, max: -5.5 })
    expect(centredRange(-4, MIRROR_RANGE.tilt)).toEqual({ min: -13, max: 5 })
    expect(centredRange(0, MIRROR_RANGE.tilt)).toEqual({ min: -9, max: 9 })
  })
})
