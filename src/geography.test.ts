import { describe, expect, it } from 'vitest'
import {
  celestialDirections,
  EARTH_RADIUS,
  geoToLocal,
  localToGeo,
  MADRID,
  tileCoordinate,
  tilePoint,
  tileUrl,
} from './geography.js'
import { createEntity, parseScene, type SceneDocument } from './scene.js'
import { createCarrier } from './presets.js'
import { idleInput, Simulation } from './simulation.js'

describe('geographic frame', () => {
  it('round-trips origin, dateline, poles and orbital heights without losing local metres', () => {
    for (const point of [
      MADRID,
      { latitude: 0, longitude: 179.99, altitude: 20000000 },
      { latitude: 84.9, longitude: -179.99, altitude: 12 },
    ]) {
      const result = localToGeo(MADRID, geoToLocal(MADRID, point))
      expect(result.latitude).toBeCloseTo(point.latitude, 7)
      expect(result.longitude).toBeCloseTo(point.longitude, 7)
      expect(result.altitude).toBeCloseTo(point.altitude, 5)
    }
    expect(geoToLocal(MADRID, MADRID).every((v) => Math.abs(v) < 1e-8)).toBe(true)
    expect(localToGeo(MADRID, [100, 0, 0]).longitude).toBeGreaterThan(MADRID.longitude)
    expect(localToGeo(MADRID, [0, 0, -100]).latitude).toBeGreaterThan(MADRID.latitude)
    expect(localToGeo(MADRID, [0, EARTH_RADIUS, 0]).altitude).toBeCloseTo(EARTH_RADIUS)
  })
  it('round-trips Mercator tiles and wraps the dateline without crossing a tile row', () => {
    const t = tileCoordinate(MADRID.latitude, MADRID.longitude, 17),
      p = tilePoint(t.x, t.y, 17)
    expect(p.latitude).toBeCloseTo(MADRID.latitude, 8)
    expect(p.longitude).toBeCloseTo(MADRID.longitude, 8)
    expect(tileUrl('satellite', 2, -1, 1)).toContain('/2/1/3')
    const polar = tileCoordinate(90, 0, 8)
    expect(Number.isFinite(polar.y)).toBe(true)
    const dirs = celestialDirections(new Date('2026-09-21T12:00:00Z'))
    expect(dirs.sun.length()).toBeCloseTo(1)
    expect(dirs.moon.length()).toBeCloseTo(1)
  })
  it('validates location and preserves it through JSON', () => {
    const doc = flightScene()
    expect(parseScene(JSON.parse(JSON.stringify(doc))).geography).toEqual(doc.geography)
    expect(() => parseScene({ ...doc, geography: { ...doc.geography, latitude: 100 } })).toThrow()
  })
})
function flightScene(): SceneDocument {
  return {
    version: 1,
    name: 'Planet',
    geography: { ...MADRID, imagery: 'offline' },
    entities: [createEntity('spawn', 'spawn', [0, 0.1, -3]), createCarrier('ship', [0, 1.2, 0])],
  }
}
function ticks(sim: Simulation, count: number) {
  for (let i = 0; i < count; i++) sim.step(1 / 60)
}
it('supports walking beyond the authored ground and assisted ascent to space, braking and returning', () => {
  const doc = flightScene(),
    sim = new Simulation(doc)
  ticks(sim, 120)
  expect(sim.player.grounded).toBe(true)
  expect(sim.interact()).toContain('Container')
  expect(sim.toggleFlight()).toContain('Modo vuelo')
  sim.setInput({ ...idleInput(), lift: 1, sprint: true })
  ticks(sim, 3600)
  const altitude = localToGeo(MADRID, sim.player.position).altitude
  expect(altitude).toBeGreaterThan(100000)
  expect(sim.player.position.every(Number.isFinite)).toBe(true)
  sim.setInput(idleInput())
  ticks(sim, 1200)
  expect(sim.player.speed).toBeLessThan(0.2)
  const held = localToGeo(MADRID, sim.player.position).altitude
  ticks(sim, 300)
  expect(Math.abs(localToGeo(MADRID, sim.player.position).altitude - held)).toBeLessThan(0.2)
  sim.setInput({ ...idleInput(), lift: -1, sprint: true })
  for (let i = 0; i < 10000 && localToGeo(MADRID, sim.player.position).altitude > 4; i++)
    ticks(sim, 1)
  sim.setInput({ ...idleInput(), lift: -0.5 })
  ticks(sim, 180)
  sim.setInput(idleInput())
  ticks(sim, 120)
  expect(sim.toggleFlight()).toBe('Modo tierra')
  sim.dispose()
  const walk = flightScene()
  walk.entities.find((e) => e.kind === 'spawn')!.transform.position = [150, 0.1, 0]
  const outside = new Simulation(walk)
  ticks(outside, 120)
  expect(outside.player.grounded).toBe(true)
  outside.dispose()
})
