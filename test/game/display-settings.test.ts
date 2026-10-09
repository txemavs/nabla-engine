import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('location', { search: '' })
const { readDisplaySettings, wantsAutoResolution } = await import('../../game/display-settings.js')

describe('demo display URL', () => {
  it('fixes the quality preset default when the player saved no scale', () => {
    expect(readDisplaySettings('')).toEqual({
      maxFps: 0,
      resolutionScale: 0.8,
      resolutionScaleMode: 'manual',
    })
    expect(readDisplaySettings('?quality=ultra').resolutionScale).toBe(1)
    expect(readDisplaySettings('?quality=high').resolutionScale).toBe(1)
    expect(readDisplaySettings('?quality=balanced').resolutionScale).toBe(0.8)
    expect(readDisplaySettings('?quality=low').resolutionScale).toBe(0.5)
    expect(readDisplaySettings('?quality=mobile').resolutionScale).toBe(0.45)
    expect(readDisplaySettings('?quality=minimal').resolutionScale).toBe(0.4)
    expect(readDisplaySettings('?quality=ultra&scale=bogus').resolutionScale).toBe(1)
    expect(wantsAutoResolution('')).toBe(false)
  })

  it('lets the saved scale win, including auto', () => {
    expect(readDisplaySettings('?quality=ultra&scale=auto')).toMatchObject({
      resolutionScaleMode: 'auto',
      resolutionScale: 0.5,
    })
    expect(readDisplaySettings('?quality=ultra&scale=0.75&fps=60')).toEqual({
      maxFps: 60,
      resolutionScale: 0.75,
      resolutionScaleMode: 'manual',
    })
    expect(wantsAutoResolution('?scale=auto')).toBe(true)
    expect(wantsAutoResolution('?scale=0.75')).toBe(false)
  })
})
