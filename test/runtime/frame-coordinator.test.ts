import { expect, it, vi } from 'vitest'
import {
  RuntimeFrameCoordinator,
  advanceAttractFrame,
  type FrameSteps,
} from '../../src/runtime/frame-coordinator.js'
import { simulationDefaults } from '../../src/config/simulation.js'

function fixture() {
  const state = { disposed: false, playing: true }
  const pause = vi.fn(() => {
      state.playing = false
    }),
    onError = vi.fn()
  const frames = new RuntimeFrameCoordinator({
    disposed: () => state.disposed,
    playing: () => state.playing,
    pause,
    onError,
  })
  return { frames, state, pause, onError }
}
function deferred() {
  let resolve!: (value: unknown) => void, reject!: (error: unknown) => void
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
function* stages(events: string[], step: unknown): FrameSteps {
  events.push('input')
  const result = yield step
  events.push(
    `physics:${result}`,
    'streaming',
    'presentation',
    'camera',
    'environment',
    'shadows',
    'render',
    'diagnostics',
  )
}

it('runs inline stages synchronously in order and forwards step results', () => {
  const { frames } = fixture(),
    events: string[] = []
  frames.drive(stages(events, 'inline'))
  expect(events).toEqual([
    'input',
    'physics:inline',
    'streaming',
    'presentation',
    'camera',
    'environment',
    'shadows',
    'render',
    'diagnostics',
  ])
  expect(frames.frameBusy).toBe(false)
})

it('suspends desktop presentation for physics, skips submissions and permits independent runtimes', async () => {
  const a = fixture(),
    b = fixture(),
    step = deferred(),
    events: string[] = [],
    other: string[] = []
  a.frames.drive(stages(events, step.promise))
  a.frames.drive(stages(events, 'skipped'))
  b.frames.drive(stages(other, 'other'))
  expect(a.frames.frameBusy).toBe(true)
  expect(events).toEqual(['input'])
  expect(other).toContain('render')
  step.resolve('worker')
  await step.promise
  expect(events).toEqual([
    'input',
    'physics:worker',
    'streaming',
    'presentation',
    'camera',
    'environment',
    'shadows',
    'render',
    'diagnostics',
  ])
  expect(a.frames.frameBusy).toBe(false)
})

it.each(['paused', 'stopped', 'disposed'])(
  'drops a pending desktop continuation when %s',
  async (mode) => {
    const f = fixture(),
      step = deferred(),
      events: string[] = []
    f.frames.drive(stages(events, step.promise))
    if (mode === 'disposed') f.state.disposed = true
    else f.state.playing = false
    step.resolve('late')
    await step.promise
    expect(events).toEqual(['input'])
    expect(f.frames.frameBusy).toBe(false)
    expect(f.onError).not.toHaveBeenCalled()
  },
)

it('preserves synchronous throws and reports asynchronous physics and presentation failures', async () => {
  const sync = fixture()
  function* fail(): FrameSteps {
    throw new Error('inline')
  }
  expect(() => sync.frames.drive(fail())).toThrow('inline')
  expect(sync.pause).not.toHaveBeenCalled()
  for (const reject of [true, false]) {
    const f = fixture(),
      step = deferred(),
      error = new Error('asynchronous')
    function* frame(): FrameSteps {
      yield step.promise
      throw error
    }
    f.frames.drive(frame())
    if (reject) step.reject(error)
    else step.resolve(null)
    await step.promise.catch(() => {})
    expect(f.pause).toHaveBeenCalledOnce()
    expect(f.onError).toHaveBeenCalledWith(error)
    expect(f.frames.frameBusy).toBe(false)
  }
})

it('keeps XR rendering synchronous, caps carried time and resumes physics on the next callback', async () => {
  const { frames } = fixture(),
    pending = deferred(),
    calls: number[] = [],
    events: string[] = []
  const step = (dt: number) => {
    calls.push(dt)
    return calls.length === 1 ? pending.promise : undefined
  }
  function frame(dt: number) {
    frames.stepXR(dt, step)
    events.push('render')
  }
  frame(0.01)
  frame(0.02)
  frame(99)
  expect(calls).toEqual([0.01])
  expect(events).toHaveLength(3)
  expect(frames.frameBusy).toBe(false)
  pending.resolve(null)
  await pending.promise
  frame(0.01)
  frame(0.02)
  expect(calls).toEqual([0.01, simulationDefaults.maxFrameSeconds + 0.01, 0.02])
})

it('retains XR error policy including paused sessions and suppresses errors after disposal', async () => {
  for (const disposed of [false, true]) {
    const f = fixture(),
      step = deferred(),
      error = new Error('XR worker')
    f.frames.stepXR(0.01, () => step.promise)
    f.state.playing = false
    f.state.disposed = disposed
    step.reject(error)
    await step.promise.catch(() => {})
    expect(f.onError.mock.calls).toEqual(disposed ? [] : [[error]])
    expect(f.pause).toHaveBeenCalledTimes(disposed ? 0 : 1)
  }
})

it('preserves first-frame, reversed-clock, capped-time, visibility and mode transition timing', () => {
  const { frames } = fixture()
  expect(frames.desktopTiming(100)).toEqual({ frameMs: 0, dt: 0 })
  expect(frames.desktopTiming(116)).toEqual({ frameMs: 16, dt: 0.016 })
  expect(frames.desktopTiming(110)).toEqual({ frameMs: 0, dt: 0 })
  expect(frames.desktopTiming(10110)).toEqual({
    frameMs: 10000,
    dt: simulationDefaults.maxFrameSeconds,
  })
  expect(frames.xrTiming(10126, true)).toBe(0.016)
  expect(frames.xrTiming(10142, false)).toBe(0)
  expect(frames.lastTime).toBeNull()
  expect(frames.xrTiming(11000, true)).toBe(0)
  expect(frames.desktopTiming(11016).dt).toBe(0.016)
  frames.lastTime = null
  expect(frames.desktopTiming(12000).dt).toBe(0)
})

it('keeps attract orbit separate, capped and damped while reporting the full interval', () => {
  const state = { last: null as number | null, elapsed: 0, orbitSpeed: 1, orbitTarget: 1 }
  expect(advanceAttractFrame(state, 10)).toBe(0)
  expect(advanceAttractFrame(state, 1010)).toBe(1000)
  expect(state.elapsed).toBe(50)
  state.orbitTarget = 0
  advanceAttractFrame(state, 1060)
  expect(state.orbitSpeed).toBeCloseTo(Math.exp(-50 / 450))
  const elapsed = state.elapsed
  advanceAttractFrame(state, 1050)
  expect(state.elapsed).toBe(elapsed)
})
