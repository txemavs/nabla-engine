import { expect, it, vi } from 'vitest'
import { readXRQuality, saveXRQuality } from '../../src/runtime/xr-quality.js'
it('bounds persistent headset settings independently of desktop scale', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k),
    setItem: (k: string, v: string) => values.set(k, v),
  })
  try {
    const settings = readXRQuality()
    expect(settings.scale).toBe(0.8)
    saveXRQuality({ ...settings, scale: 1.2, foveation: 0.3, shadows: true })
    expect(readXRQuality()).toMatchObject({ scale: 1.2, foveation: 0.3, shadows: true })
    values.set('nabla.xr.quality.v1', '{"scale":9,"foveation":-2,"roadDetail":100}')
    expect(readXRQuality()).toMatchObject({ scale: 1.5, foveation: 0, roadDetail: 16 })
  } finally {
    vi.unstubAllGlobals()
  }
})
