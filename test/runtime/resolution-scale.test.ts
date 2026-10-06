import { describe, expect, it } from 'vitest'
import {
  autoResolutionScaleRange,
  displayDefaults,
  presetResolutionScale,
  presetResolutionScales,
  resolveDisplaySettings,
} from '../../src/config/display.js'
import { AdaptiveResolutionScale, probeResolutionTier } from '../../src/runtime/resolution-scale.js'

describe('display resolution modes', () => {
  it('defaults to a fixed scale ladder per quality preset', () => {
    expect(displayDefaults).toMatchObject({ resolutionScale: 0.8, resolutionScaleMode: 'manual' })
    expect(resolveDisplaySettings()).toEqual({
      maxFps: 0,
      resolutionScale: 0.8,
      resolutionScaleMode: 'manual',
    })
    expect(presetResolutionScales).toEqual({
      ultra: 1,
      high: 0.9,
      balanced: 0.8,
      low: 0.5,
      mobile: 0.45,
      minimal: 0.4,
    })
    for (const [preset, scale] of Object.entries(presetResolutionScales))
      expect(resolveDisplaySettings({}, preset)).toEqual({
        maxFps: 0,
        resolutionScale: scale,
        resolutionScaleMode: 'manual',
      })
    for (const preset of ['custom', 'unknown', 'toString', undefined])
      expect(presetResolutionScale(preset)).toBe(0.8)
    // An explicit host or player choice wins over the preset step.
    expect(resolveDisplaySettings({ resolutionScale: 0.6 }, 'ultra').resolutionScale).toBe(0.6)
  })

  it('keeps auto selectable: starts at 50% with a 0.5..1 auto clamp', () => {
    expect(resolveDisplaySettings({ resolutionScaleMode: 'auto' }, 'ultra')).toEqual({
      maxFps: 0,
      resolutionScale: 0.5,
      resolutionScaleMode: 'auto',
    })
    expect(autoResolutionScaleRange).toEqual({ min: 0.5, max: 1 })
    expect(() =>
      resolveDisplaySettings({ resolutionScaleMode: 'auto', resolutionScale: 0.3 }),
    ).toThrow()
  })

  it('treats an explicit scale as a fixed manual host choice', () => {
    expect(resolveDisplaySettings({ resolutionScale: 0.75 })).toMatchObject({
      resolutionScale: 0.75,
      resolutionScaleMode: 'manual',
    })
    expect(resolveDisplaySettings({ resolutionScale: 0.25 }).resolutionScaleMode).toBe('manual')
    expect(resolveDisplaySettings({ resolutionScaleMode: 'manual' }).resolutionScale).toBe(1)
    expect(() => resolveDisplaySettings({ resolutionScale: 0.2 })).toThrow()
    expect(() =>
      resolveDisplaySettings({ resolutionScaleMode: 'turbo' as never, resolutionScale: 1 }),
    ).toThrow()
  })
})

describe('AdaptiveResolutionScale', () => {
  const feed = (scale: AdaptiveResolutionScale, frameMs: number, frames: number, start = 0) => {
    let time = start
    const changes: number[] = []
    for (let i = 0; i < frames; i++) {
      time += frameMs
      const next = scale.observeFrame(frameMs, time)
      if (next !== null) changes.push(next)
    }
    return { changes, time }
  }

  it('starts at 50% and raises toward 100% while frames are healthy', () => {
    const adaptive = new AdaptiveResolutionScale()
    expect(adaptive.state).toEqual({ mode: 'auto', scale: 0.5 })
    const { changes } = feed(adaptive, 8, 2000)
    expect(changes[0]).toBe(0.55)
    expect(adaptive.state.scale).toBe(1)
    expect(Math.max(...changes)).toBe(1)
  })

  it('lowers toward 50% (never below) when frames struggle', () => {
    const adaptive = new AdaptiveResolutionScale({ scale: 1 })
    feed(adaptive, 40, 2000)
    expect(adaptive.state.scale).toBe(0.5)
  })

  it('never moves a manual scale', () => {
    const adaptive = new AdaptiveResolutionScale({ mode: 'manual', scale: 0.8 })
    expect(feed(adaptive, 60, 500).changes).toEqual([])
    expect(adaptive.state).toEqual({ mode: 'manual', scale: 0.8 })
    adaptive.setAuto()
    expect(adaptive.state.mode).toBe('auto')
    adaptive.setManual(0.3)
    expect(adaptive.state).toEqual({ mode: 'manual', scale: 0.3 })
  })

  it('judges health against an FPS cap and ignores stalls', () => {
    const adaptive = new AdaptiveResolutionScale({ scale: 0.7 })
    adaptive.setTargetFrameMs(1000 / 30)
    // 33 ms frames are on budget at a 30 FPS cap: raise, do not drop.
    feed(adaptive, 1000 / 30, 600)
    expect(adaptive.state.scale).toBeGreaterThan(0.7)
    const before = adaptive.state.scale
    expect(adaptive.observeFrame(5000, 1e9)).toBeNull()
    expect(adaptive.state.scale).toBe(before)
  })

  it('waits a cooldown between steps', () => {
    const adaptive = new AdaptiveResolutionScale({ cooldownMs: 1000 })
    expect(adaptive.observeFrame(5, 10)).toBe(0.55)
    expect(adaptive.observeFrame(5, 500)).toBeNull()
    expect(adaptive.observeFrame(5, 1011)).toBe(0.6)
  })
})

describe('probeResolutionTier', () => {
  const fakeClock = (step: number) => {
    let now = 0
    return { now: () => now, advance: () => (now += step) }
  }

  it('maps a fast machine to full scale and a high tier', async () => {
    const clock = fakeClock(10)
    const result = await probeResolutionTier({
      durationMs: 3000,
      now: clock.now,
      sleep: async () => {},
      sample: () => {
        clock.advance()
        return 8
      },
    })
    expect(result).toMatchObject({ resolutionScale: 1, qualityTier: 'high', medianFrameMs: 8 })
    expect(result.samples).toBe(300)
  })

  it('maps a slow machine to 50% and a minimal tier', async () => {
    const clock = fakeClock(50)
    const result = await probeResolutionTier({
      durationMs: 3000,
      now: clock.now,
      sleep: async () => {},
      sample: () => {
        clock.advance()
        return 55
      },
    })
    expect(result).toMatchObject({ resolutionScale: 0.5, qualityTier: 'minimal' })
  })

  it('rejects unusably short probes', async () => {
    await expect(probeResolutionTier({ durationMs: 10, sample: () => 1 })).rejects.toThrow()
  })
})
