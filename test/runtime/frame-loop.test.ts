import { expect, test } from 'vitest'
import { FrameLoop } from '../../src/runtime/frame-loop.js'
import { resolveDisplaySettings } from '../../src/config/display.js'

/** Run deterministic browser timestamps without wall-clock sleeps. */
function scheduler() {
  let next = 0
  const pending = new Map<number, FrameRequestCallback>()
  return {
    pending,
    request: (callback: FrameRequestCallback) => {
      pending.set(++next, callback)
      return next
    },
    cancel: (id: number) => {
      pending.delete(id)
    },
    tick: (time: number) => {
      const entries = [...pending]
      pending.clear()
      for (const [, callback] of entries) callback(time)
    },
  }
}

test('caps a 144 Hz scheduler at 60 without drift and passes real timestamps to physics', () => {
  const clock = scheduler(),
    times: number[] = []
  const loop = new FrameLoop((time) => times.push(time), clock.request, clock.cancel)
  loop.setMaxFps(60)
  loop.start()
  for (let frame = 0; frame <= 1440; frame++) clock.tick((frame * 1000) / 144)
  expect(times.length).toBeGreaterThanOrEqual(600)
  expect(times.length).toBeLessThanOrEqual(602)
  expect(times.at(-1)).toBeCloseTo(10000)
  expect(clock.pending.size).toBe(1)
  loop.stop()
  expect(clock.pending.size).toBe(0)
})

test('does not burst after a stall and supports live uncapping and restart', () => {
  const clock = scheduler(),
    times: number[] = []
  const loop = new FrameLoop((time) => times.push(time), clock.request, clock.cancel)
  loop.setMaxFps(30)
  loop.start()
  clock.tick(0)
  clock.tick(16)
  clock.tick(1000)
  expect(times).toEqual([0, 1000])
  loop.setMaxFps(0)
  clock.tick(1016)
  clock.tick(1032)
  expect(times).toEqual([0, 1000, 1016, 1032])
  loop.stop()
  loop.start()
  clock.tick(9000)
  expect(times.at(-1)).toBe(9000)
  loop.stop()
})

test('rejects invalid display overrides and stops scheduling when a frame fails', () => {
  for (const maxFps of [NaN, -1, 15, Infinity, 361])
    expect(() => resolveDisplaySettings({ maxFps })).toThrow()
  expect(() => resolveDisplaySettings({ resolutionScale: 0 })).toThrow()
  const clock = scheduler()
  const loop = new FrameLoop(
    () => {
      throw new Error('frame failed')
    },
    clock.request,
    clock.cancel,
  )
  loop.start()
  expect(() => clock.tick(0)).toThrow('frame failed')
  expect(clock.pending.size).toBe(0)
})
