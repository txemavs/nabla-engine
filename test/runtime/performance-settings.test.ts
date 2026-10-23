import { expect, it, vi } from 'vitest'
import { RuntimePerformanceSettings } from '../../src/runtime/performance-settings.js'
import { tileBudget, visibilityChoices } from '../../src/runtime/performance.js'

it('keeps profile resolution and live overrides independent between runtimes', () => {
  const a = new RuntimePerformanceSettings({ preset: 'minimal' }),
    b = new RuntimePerformanceSettings({ preset: 'minimal' })
  const initial = { ...b.state }
  a.enableXRShadows()
  expect(a.state.shadows).toBe(512)
  a.setVisibility({ roads: visibilityChoices.roads[0] })
  a.setGroundDetail(9)
  expect(a.groundDetail).toBe(3)
  expect(b.groundDetail).toBe(1)
  expect(b.state).toEqual(initial)
  const custom = new RuntimePerformanceSettings({ preset: 'minimal', shadows: 1024 })
  custom.enableXRShadows()
  expect(custom.state.shadows).toBe(1024)
})

it('preserves streaming cell defaults and explicit cell overrides', () => {
  const settings = new RuntimePerformanceSettings()
  const world = { setDistance: vi.fn(), setMaxTiles: vi.fn() }
  settings.setStreaming({ distance: 2000 }, world)
  expect(settings.state.distance).toBe(2000)
  expect(world.setMaxTiles).toHaveBeenLastCalledWith(tileBudget(2000))
  settings.setStreaming({ distance: 3000, cells: 7 }, world)
  expect(world.setMaxTiles).toHaveBeenLastCalledWith(7)
  expect(world.setMaxTiles).toHaveBeenCalledTimes(2)
  settings.setStreaming({ cells: 9 }, world)
  expect(world.setDistance).toHaveBeenCalledTimes(2)
  expect(settings.state.distance).toBe(3000)
  settings.setStreaming({ distance: 4000 })
  expect(settings.state.distance).toBe(4000)
})

it('validates distance and visibility before changing state or world', () => {
  const settings = new RuntimePerformanceSettings(),
    before = { ...settings.state }
  const world = { setDistance: vi.fn(), setMaxTiles: vi.fn() }
  expect(() => settings.setStreaming({ distance: Infinity }, world)).toThrow('Load distance')
  expect(() => settings.setVisibility({ roads: visibilityChoices.roads[0], fog: -123 })).toThrow(
    'Unsupported fog',
  )
  expect(settings.state).toEqual(before)
  expect(world.setDistance).not.toHaveBeenCalled()
})
