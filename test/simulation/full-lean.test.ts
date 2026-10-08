/**
 * Full lean ("total estribo"): held full steer raises the vfr800's lean limit from `maxLean` to
 * the GLB-measured peg lean of that side over ~2 s, the peg scrapes there, the automatic rider
 * hangs off further, and letting go relaxes the limit back.
 */
import { describe, expect, it } from 'vitest'
import type * as THREE from 'three'
import { ShotSparks } from '../../src/render/entity/shot-sparks.js'
import { MetalScrape } from '../../src/audio/scrape.js'
import { presetVehicle, vehiclePreset } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import type { PlayerInput } from '../../src/simulation/contracts.js'
import { parseScene } from '../../src/scene/document.js'
import { twoWheeledDefaults } from '../../src/config/simulation.js'
import { finishStartUp } from '../start-up.js'

const preset = vehiclePreset('vfr800').vehicle!.twoWheeled!
const peg = preset.pegLean!
const maxLean = preset.maxLean ?? twoWheeledDefaults.maxLean
const deg = (r: number) => (r * 180) / Math.PI

function ride(kmh: number) {
  const floor = createEntity('floor', 'box', [0, -0.5, -4000])
  floor.size = [10000, 1, 10000]
  const bike = presetVehicle('vfr800', 'bike', [0, 0.6, 0])
  const s = new Simulation(
    parseScene({
      version: 1,
      name: 'Full lean',
      entities: [floor, bike, createEntity('spawn', 'spawn', [3, 1, 4])],
    }),
  )
  for (let i = 0; i < 60; i++) s.step(1 / 60)
  s.startInVehicle('bike')
  finishStartUp(s)
  const pose = () => s.twoWheeledPose('bike')!
  const step = (input: Partial<PlayerInput>) => {
    s.setInput({ ...idleInput(), ...input })
    s.step(1 / 60)
  }
  let guard = 0
  while (pose().roadSpeed * 3.6 < kmh && guard++ < 60 * 60) step({ forward: 1 })
  const hold = (seconds: number, right: number) => {
    for (let i = 0; i < seconds * 60; i++)
      step({ forward: pose().roadSpeed * 3.6 < kmh ? 0.6 : 0.2, right })
  }
  return { pose, hold, dispose: () => s.dispose() }
}

describe('vfr800 full lean', () => {
  it('uses the lean measured from the GLB: peg below the fall lean, above the normal limit', () => {
    // scripts/vfr800-lean-clearance.mjs: left footpeg rubber 52.1°, right passenger peg 54.2°.
    expect(deg(peg.left.lean)).toBeCloseTo(52.1, 1)
    expect(deg(peg.right.lean)).toBeCloseTo(54.2, 1)
    for (const side of [peg.left, peg.right]) {
      expect(side.lean).toBeGreaterThan(maxLean)
      expect(side.lean).toBeLessThan(twoWheeledDefaults.fallLean)
    }
    // The touching points sit outboard and low, left and right.
    expect(peg.left.point[0]).toBeLessThan(-0.15)
    expect(peg.right.point[0]).toBeGreaterThan(0.15)
  })

  for (const [side, right] of [
    ['right', 1],
    ['left', -1],
  ] as const) {
    it(`keeps the normal limit, then reaches the ${side} peg with held full steer and relaxes`, () => {
      const r = ride(100)
      r.hold(0.8, right)
      const normal = r.pose()
      // A short full steer keeps the normal limit and the normal lean.
      expect(normal.leanLimit).toBeLessThan(maxLean + 0.02)
      expect(Math.abs(normal.lean)).toBeLessThan(maxLean + 0.01)
      expect(normal.scrape).toBe(0)
      r.hold(2.5, right)
      const full = r.pose()
      const pegLean = peg[side].lean
      expect(full.leanLimit).toBeCloseTo(pegLean, 3)
      // The bike reaches the peg (left-positive lean) and goes no further.
      expect(Math.sign(full.lean)).toBe(side === 'left' ? 1 : -1)
      expect(Math.abs(full.lean)).toBeGreaterThan(pegLean - 0.02)
      expect(Math.abs(full.lean)).toBeLessThan(pegLean + 0.02)
      expect(full.fallen).toBe(false)
      // Scraping at the peg on the inside of the turn, stronger with speed.
      expect(full.scrape).toBeGreaterThan(0.3)
      expect(full.scrapePoint).toEqual(peg[side].point)
      // The automatic rider hangs off further than at the normal limit.
      expect(Math.abs(full.riderShift[0])).toBeGreaterThan(Math.abs(normal.riderShift[0]) + 0.05)
      r.hold(1.5, 0)
      const relaxed = r.pose()
      expect(relaxed.leanLimit).toBeCloseTo(maxLean, 6)
      expect(relaxed.scrape).toBe(0)
      expect(relaxed.scrapePoint).toBeNull()
      r.dispose()
    })
  }
})

describe('footpeg scrape effects', () => {
  it('streams the bullet-impact sparks with the count and trailing drift asked for', () => {
    const sparks = new ShotSparks()
    sparks.add([0, 0, 0], 1000, [0, 1, 0], { count: 4, drift: [0, 0, -20], speed: 0.5 })
    sparks.update(1100)
    const points = sparks.root.children[0] as THREE.Points
    expect(points.geometry.drawRange.count).toBe(4)
    const z = points.geometry.getAttribute('position').getZ(0)
    // 0.1 s of a −20 m/s drift (the random spread is at most ±1.8 m/s × 0.1 s).
    expect(z).toBeLessThan(-1.7)
    sparks.dispose()
  })

  it('grinds only while scraping, louder with the scrape, silent when muted', () => {
    class Param {
      value = 0
      target = 0
      setTargetAtTime(value: number) {
        this.target = value
        return this
      }
    }
    const node = () => ({
      gain: new Param(),
      frequency: new Param(),
      Q: new Param(),
      type: '',
      connect() {},
    })
    const context = {
      currentTime: 0,
      destination: node(),
      createGain: node,
      createBiquadFilter: node,
    } as unknown as AudioContext
    const noise = node() as unknown as AudioBufferSourceNode
    const scrape = new MetalScrape(context, noise, () => 0.5)
    const gain = () => (scrape as unknown as { output: { gain: Param } }).output.gain.target
    scrape.update(0, true, 0, 100)
    expect(gain()).toBe(0)
    scrape.update(0, true, 0.4, 100)
    const light = gain()
    scrape.update(0, true, 1, 100)
    expect(light).toBeGreaterThan(0)
    expect(gain()).toBeGreaterThan(light)
    scrape.update(0, false, 1, 100)
    expect(gain()).toBe(0)
  })
})
