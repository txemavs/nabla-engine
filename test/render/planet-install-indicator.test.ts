import { expect, it, vi } from 'vitest'
import { PlanetWorld } from '../../src/render/planet/world.js'
it('does not consume or install a queued cell until the host has painted its indicator', () => {
  let painted = false
  const step = vi.fn(), complete = vi.fn(), timing = {}
  const world = Object.create(PlanetWorld.prototype) as any
  Object.assign(world, {
    installQueue: [{ key: 'cell', manifest: {}, payload: {} }],
    beforeInstall: () => painted,
    afterInstall: complete,
    install: function* () { step() },
    stamp: () => timing,
    pump: vi.fn(), maxInstallMs: 0,
  })
  expect(world.flushInstall()).toBe(false)
  expect(world.installQueue).toHaveLength(1)
  expect(step).not.toHaveBeenCalled()
  painted = true
  expect(world.flushInstall()).toBe(true)
  expect(step).toHaveBeenCalledTimes(1)
  expect(complete).toHaveBeenCalledWith('cell')
  expect(world.installQueue).toHaveLength(0)
})
