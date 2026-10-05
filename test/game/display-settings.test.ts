import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('location', { search: '' })
const { readDisplaySettings, wantsAutoResolution } = await import('../../game/display-settings.js')

describe('demo display URL', () => {
  it('uses auto resolution unless scale is fixed', () => {
    expect(readDisplaySettings('')).toMatchObject({
      resolutionScaleMode: 'auto',
      resolutionScale: 0.5,
    })
    expect(readDisplaySettings('?scale=auto').resolutionScaleMode).toBe('auto')
    expect(readDisplaySettings('?scale=0.75&fps=60')).toEqual({
      maxFps: 60,
      resolutionScale: 0.75,
      resolutionScaleMode: 'manual',
    })
    expect(wantsAutoResolution('?scale=0.75')).toBe(false)
    expect(wantsAutoResolution('')).toBe(true)
  })
})
