import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeWorldControls, type WorldControlsHost } from '../../src/runtime/world-controls.js'
import type { SceneDocument } from '../../src/scene/document.js'
import { simulationDefaults } from '../../src/config/simulation.js'
import { worldWater } from '../../src/runtime/water.js'

function fixture(options = {}) {
  const document: SceneDocument = { version: 1, name: 'World controls', entities: [] }
  let simulation: ReturnType<WorldControlsHost['simulation']> = null
  let disposed = false
  const recover: WorldControlsHost['recover'] = { snapToRoad: false }
  const roads = vi.fn<WorldControlsHost['roads']>(() => [])
  const pavedAreas = vi.fn<WorldControlsHost['pavedAreas']>(() => [])
  const controls = new RuntimeWorldControls(
    {
      document: () => document,
      simulation: () => simulation,
      recover,
      roads,
      pavedAreas,
      assertAlive() {
        if (disposed) throw new Error('disposed')
      },
    },
    options,
  )
  return {
    controls,
    document,
    recover,
    roads,
    pavedAreas,
    play(value = (n: number) => n) {
      simulation = { setGravityScale: vi.fn(value) }
      controls.applyGravity(simulation)
      return simulation
    },
    stop() {
      simulation = null
    },
    dispose() {
      disposed = true
    },
  }
}
afterEach(() => vi.useRealTimers())

it('retains constructor gravity until play and uses the value accepted by each simulation', () => {
  const f = fixture({ gravityScale: 999, recoverToRoad: false })
  expect(f.controls.gravityScale).toBe(999)
  expect(f.controls.recoverToRoadEnabled).toBe(false)
  const sim = f.play(() => 2)
  expect(sim.setGravityScale).toHaveBeenCalledWith(999)
  expect(f.controls.gravityScale).toBe(2)
  expect(f.controls.setGravityScale(0.5)).toBe(2)
  expect(sim.setGravityScale).toHaveBeenLastCalledWith(0.5)
  f.stop()
  expect(f.controls.setGravityScale(0.75)).toBe(0.75)
  expect(f.play().setGravityScale).toHaveBeenCalledWith(0.75)
})

it('preserves setter clamps and nonfinite fallback before play', () => {
  const { controls } = fixture()
  const range = simulationDefaults.gravityScaleRange
  expect(controls.gravityScale).toBe(range.default)
  expect(controls.setGravityScale(-999)).toBe(range.min)
  expect(controls.setGravityScale(999)).toBe(range.max)
  for (const n of [NaN, Infinity, -Infinity])
    expect(controls.setGravityScale(n)).toBe(range.default)
})

it('shares recovery policy with gameplay while keeping providers live and instances independent', () => {
  const a = fixture(),
    b = fixture()
  expect(a.controls.recoverToRoadEnabled).toBe(true)
  a.controls.setRecoverToRoadEnabled(false)
  expect(a.recover.snapToRoad).toBe(false)
  a.recover.snapToRoad = true
  expect(a.controls.recoverToRoadEnabled).toBe(true)
  a.recover.roads!()
  a.recover.roads!()
  a.recover.pavedAreas!()
  expect(a.roads).toHaveBeenCalledTimes(2)
  expect(a.pavedAreas).toHaveBeenCalledOnce()
  expect(b.roads).not.toHaveBeenCalled()
  a.controls.setGravityScale(0.5)
  a.controls.setWater({ mode: 'manual', level: 7, amplitude: 1 })
  a.controls.setSkyClock({ mode: 'fixed', at: '2026-10-24T12:00:00Z' })
  expect(b.controls.gravityScale).toBe(1)
  expect(b.controls.waterSettings).toBeUndefined()
  expect(b.controls.skyClock).toEqual({ mode: 'live' })
})

it('restarts authored live time at both warmup and reveal, retaining fixed and default clocks', () => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
  const f = fixture()
  f.document.sky = { mode: 'live', rate: 20, origin: '2026-10-24T10:00:00Z', since: 0 }
  f.controls.restartAuthoredClock()
  expect(f.controls.skyClock).toEqual({ ...f.document.sky, since: 1000 })
  vi.setSystemTime(2000)
  f.controls.restartAuthoredClock()
  expect(f.controls.skyClock).toMatchObject({ since: 2000, rate: 20 })
  f.controls.setSkyClock({ mode: 'fixed', at: 'authored-invalid-time' })
  f.controls.restartAuthoredClock()
  expect(f.controls.skyClock).toEqual({ mode: 'fixed', at: 'authored-invalid-time' })
  f.controls.setSkyClock({ mode: 'live', rate: 1, origin: '2026-10-24T10:00:00Z' })
  expect(f.controls.skyClock).toEqual({ mode: 'live' })
  expect(() => f.controls.setSkyClock({ mode: 'live', rate: 20, origin: 'invalid' })).toThrow(
    RangeError,
  )
})

it('clones authored water, deletes overrides and computes tides against the current sky clock', () => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
  const f = fixture(),
    water = { mode: 'manual' as const, level: 3, amplitude: 1 }
  f.controls.setWater(water)
  water.level = 9
  expect(f.controls.sea).toEqual({ level: 3, state: 'Manual' })
  f.controls.setWater(undefined)
  expect(Object.hasOwn(f.document, 'water')).toBe(false)
  for (const at of ['2026-10-24T10:00:00Z', '2026-10-24T16:00:00Z']) {
    f.controls.setSkyClock({ mode: 'fixed', at })
    expect(f.controls.sea).toEqual(worldWater(undefined, { mode: 'fixed', at }, 1000))
  }
})

it('rejects public mutations after disposal without affecting another runtime', () => {
  const a = fixture(),
    b = fixture()
  a.dispose()
  for (const mutate of [
    () => a.controls.setGravityScale(2),
    () => a.controls.setRecoverToRoadEnabled(false),
    () => a.controls.setWater(undefined),
    () => a.controls.setSkyClock({ mode: 'live' }),
  ])
    expect(mutate).toThrow('disposed')
  expect(b.controls.setGravityScale(2)).toBe(2)
})
