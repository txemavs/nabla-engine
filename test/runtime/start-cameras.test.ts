import { describe, expect, it } from 'vitest'
import {
  START_CAMERA_HOLD_MS,
  StartCameraSequencer,
  resolveStartCameras,
} from '../../src/runtime/start-cameras.js'

const euskadi = resolveStartCameras([
  'overhead',
  { view: 'driver', after: 800, transitionMs: 1800 },
  { view: 'chase', after: 'engine', transitionMs: 1400 },
])

describe('start camera sequence', () => {
  it('keeps an overhead descent height and rejects a negative one', () => {
    const [first, second] = resolveStartCameras([{ view: 'overhead', fromHeight: 600 }, 'driver'])
    expect(first).toMatchObject({ view: 'map', fromHeight: 600 })
    expect(second).not.toHaveProperty('fromHeight')
    expect(() => resolveStartCameras([{ view: 'overhead', fromHeight: -1 }])).toThrow(RangeError)
  })
  it('maps host names to camera views and fills defaults', () => {
    expect(resolveStartCameras(undefined)).toEqual([])
    expect(euskadi).toEqual([
      { view: 'map', after: START_CAMERA_HOLD_MS, transitionMs: null },
      { view: 'cockpit', after: 800, transitionMs: 1800 },
      { view: 'chase', after: 'engine', transitionMs: 1400 },
    ])
    expect(resolveStartCameras(['map', 'cockpit', 'cinematic']).map((s) => s.view)).toEqual([
      'map',
      'cockpit',
      'cinematic',
    ])
  })

  it('rejects unknown views and bad times', () => {
    expect(() => resolveStartCameras(['sideways' as never])).toThrow(RangeError)
    expect(() => resolveStartCameras(['toString' as never])).toThrow(RangeError)
    expect(() => resolveStartCameras([{ view: 'chase', after: -1 }])).toThrow(RangeError)
    expect(() => resolveStartCameras([{ view: 'chase', transitionMs: Number.NaN }])).toThrow(
      RangeError,
    )
    expect(() => resolveStartCameras('overhead' as never)).toThrow(TypeError)
    expect(() => new StartCameraSequencer([])).toThrow(RangeError)
  })

  it('overhead, hold, driver, engine start on arrival, chase once the engine runs', () => {
    const seq = new StartCameraSequencer(euskadi)
    expect(seq.first).toBe('map')
    expect(seq.holdsEngine).toBe(true)
    const frame = (now: number, arrived = true, engineRunning = false) =>
      seq.update({ now, arrived, engineRunning })
    // Overhead is reached on the first frame; the driver step waits its 800 ms hold.
    expect(frame(0)).toEqual({})
    expect(frame(799)).toEqual({})
    expect(frame(800)).toEqual({ view: 'cockpit', transitionMs: 1800 })
    // The blend runs: nothing happens until the camera is in the seat.
    expect(frame(900, false)).toEqual({})
    expect(frame(2600, false)).toEqual({})
    // Arriving in the seat starts the engine (and decides nothing else that frame).
    expect(frame(2616, true, true)).toEqual({ startEngine: true })
    expect(frame(2632, true, false)).toEqual({})
    expect(frame(4200, true, true)).toEqual({ view: 'chase', transitionMs: 1400 })
    expect(frame(4216, false, true)).toEqual({})
    expect(frame(5700, true, true)).toEqual({ done: true })
    expect(seq.done).toBe(true)
    expect(frame(6000)).toEqual({ done: true })
  })

  it('without an engine step the engine is left alone and steps follow their holds', () => {
    const seq = new StartCameraSequencer(resolveStartCameras(['overhead', 'chase']))
    expect(seq.holdsEngine).toBe(false)
    expect(seq.update({ now: 0, arrived: true, engineRunning: false })).toEqual({})
    expect(seq.update({ now: START_CAMERA_HOLD_MS, arrived: true, engineRunning: false })).toEqual({
      view: 'chase',
      transitionMs: null,
    })
  })

  it('skips on player input: a held engine starts; driving input jumps to the last view', () => {
    const seq = new StartCameraSequencer(euskadi)
    seq.update({ now: 0, arrived: true, engineRunning: false })
    expect(seq.skip()).toEqual({ done: true, startEngine: true, view: 'chase' })
    expect(seq.skip()).toEqual({ done: true })
    const byC = new StartCameraSequencer(euskadi)
    expect(byC.skip(false)).toEqual({ done: true, startEngine: true })
  })
})

it('the start descent is warmed from its start height down to the overhead height', async () => {
  const { descentWarmHeights } = await import('../../src/runtime/start-cameras.js')
  expect(descentWarmHeights(600, 45)).toEqual([600, 300, 150, 75, 45])
  expect(descentWarmHeights(50, 45)).toEqual([45])
  expect(descentWarmHeights(30, 45)).toEqual([30])
  expect(descentWarmHeights(0, 45)).toEqual([])
})
