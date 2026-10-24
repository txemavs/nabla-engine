import { expect, it, vi } from 'vitest'
import { RuntimeDisplayController } from '../../src/runtime/display-controller.js'

it('preserves preset defaults and explicit manual/auto transitions', () => {
  const display = new RuntimeDisplayController(undefined, 'ultra'),
    fps = vi.fn()
  expect(display.settings.resolutionScale).toBe(2)
  expect(display.update({ resolutionScaleMode: 'auto' }, fps)).toEqual({
    resize: true,
    modeChanged: true,
  })
  expect(display.state).toEqual({ mode: 'auto', scale: 1 })
  expect(display.update({ resolutionScale: 0.75 }, fps)).toEqual({
    resize: true,
    modeChanged: true,
  })
  expect(display.state).toEqual({ mode: 'manual', scale: 0.75 })
  expect(display.update({}, fps)).toEqual({ resize: false, modeChanged: false })
  expect(fps).not.toHaveBeenCalled()
})

it('validates before changing settings or the loop and only updates FPS when changed', () => {
  const display = new RuntimeDisplayController(),
    fps = vi.fn()
  expect(() => display.update({ maxFps: 1, resolutionScale: 2 }, fps)).toThrow(RangeError)
  expect(() => display.update({ resolutionScale: NaN }, fps)).toThrow(RangeError)
  expect(display.settings).toEqual({ maxFps: 0, resolutionScale: 1, resolutionScaleMode: 'manual' })
  expect(fps).not.toHaveBeenCalled()
  display.update({ maxFps: 60 }, fps)
  display.update({ maxFps: 60 }, fps)
  expect(fps).toHaveBeenCalledExactlyOnceWith(60)
})

it('isolates adaptation, FPS budgets and probe results between runtimes', () => {
  const a = new RuntimeDisplayController({
    resolutionScaleMode: 'auto',
    resolutionScale: 0.75,
    maxFps: 30,
  })
  const b = new RuntimeDisplayController({ resolutionScaleMode: 'auto', resolutionScale: 0.75 })
  // 30 ms is healthy at a 30 FPS cap but struggling when uncapped.
  expect(a.observeFrame(30, 1000)).toBe(true)
  expect(b.observeFrame(30, 1000)).toBe(true)
  expect(a.state.scale).toBe(0.8)
  expect(b.state.scale).toBe(0.7)
  a.applyProbe(0.9)
  expect(a.settings.resolutionScale).toBe(0.9)
  expect(b.settings.resolutionScale).toBe(0.7)
  a.update({ resolutionScale: 1.5 }, () => {})
  a.applyProbe(0.5)
  expect(a.observeFrame(100, 5000)).toBe(false)
  expect(a.settings.resolutionScale).toBe(1.5)
  const snapshot = b.state
  snapshot.scale = 99
  expect(b.state.scale).toBe(0.7)
})
