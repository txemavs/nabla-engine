import { describe, expect, it } from 'vitest'
import { Fsr1, fsrSize, resolveFsr } from '../../src/render/effects/fsr1.js'
import type { WebGLRenderer } from 'three'

describe('FSR settings and bypass', () => {
  it('defaults off and validates values without silently corrupting dimensions', () => {
    expect(resolveFsr()).toEqual({ mode: 'off', sharpness: 0.5 })
    expect(() => resolveFsr({ sharpness: NaN })).toThrow()
    expect(() => resolveFsr({ sharpness: 1.1 })).toThrow()
    expect(() => resolveFsr({ mode: 'bogus' as never })).toThrow()
    expect(fsrSize(2560, 1440, 'quality')).toEqual([1707, 960])
    expect(fsrSize(2560, 1440, 'performance')).toEqual([1280, 720])
    expect(fsrSize(1, 1, 'performance')).toEqual([1, 1])
  })
  it('allocates no render targets while disabled and bypasses immersive XR', () => {
    const fsr = new Fsr1()
    expect(fsr.begin({} as WebGLRenderer)).toBe(false)
    expect(fsr.input).toBeNull()
    fsr.setSettings({ mode: 'quality' })
    expect(fsr.begin({ xr: { isPresenting: true } } as WebGLRenderer)).toBe(false)
    expect(fsr.input).toBeNull()
    fsr.dispose()
  })
})
