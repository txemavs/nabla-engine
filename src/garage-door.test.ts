import { expect, it } from 'vitest'
import { createCarrier } from './presets.js'
import { createCarrierPortals, createPortalPair } from './portal.js'
import { createEntity } from './scene.js'
import { Simulation } from './simulation.js'
const make = (spawn: [number, number, number] = [0, 0.35, -2.8]) =>
  new Simulation({
    version: 1,
    name: 'Door',
    entities: [
      { ...createEntity('ground', 'box', [0, -0.5, 0]), size: [100, 1, 100] },
      createEntity('spawn', 'spawn', spawn),
      createCarrier('ship', [0, 1.2, 0]),
      ...createCarrierPortals('ship', 'bow', 'stern'),
      ...createPortalPair('a', 'b', [20, 1.455, 0], [40, 1.455, 0]),
    ],
  })
const advance = (sim: Simulation, n = 150) => {
  for (let i = 0; i < n; i++) sim.step(1 / 60)
}
it('requires a fully closed door on either end and disconnects before opening the garage', () => {
  const sim = make()
  advance(sim)
  expect(() => sim.configurePortal('stern', 'a', 'open')).toThrow('Cierra')
  expect(() => sim.configurePortal('a', 'stern', 'open')).toThrow('Cierra')
  sim.setGarageDoor('ship', true)
  advance(sim, 30)
  expect(sim.vehicleInfo('ship').rampAngle).toBeLessThan(0)
  expect(sim.vehicleInfo('ship').rampMoving).toBe(true)
  expect(() => sim.configurePortal('stern', 'a', 'open')).toThrow('Cierra')
  advance(sim)
  expect(sim.vehicleInfo('ship').rampClosed).toBe(true)
  sim.configurePortal('stern', 'a', 'open')
  sim.setGarageDoor('ship', false)
  expect(sim.portalState('stern').mode).toBe('closed')
  expect(sim.portalState('a').mode).toBe('closed')
  expect(sim.vehicleInfo('ship').rampMoving).toBe(true)
  sim.configurePortal('b', null, 'closed')
  expect(() => sim.configurePortal('stern', 'a', 'open')).toThrow('Cierra')
  advance(sim)
  expect(sim.vehicleInfo('ship').rampAngle).toBeCloseTo(0)
  sim.dispose()
})
it('validates and reports the helm cruise-speed setting', () => {
  const sim = make()
  sim.setCruiseSpeed('ship', 300)
  expect(sim.vehicleInfo('ship').cruiseSpeed).toBe(300)
  expect(() => sim.setCruiseSpeed('ship', NaN)).toThrow()
  expect(() => sim.setCruiseSpeed('ship', 1001)).toThrow()
  sim.dispose()
})

it('refuses to sweep the garage door through an actor', () => {
  const sim = make([0, 0.35, 6])
  advance(sim)
  expect(() => sim.setGarageDoor('ship', true)).toThrow('Despeja')
  expect(sim.vehicleInfo('ship').rampMoving).toBe(false)
  sim.dispose()
})
