/**
 * Two-wheeler crashes beyond the hooligan loop: a hard impact tumbles the machine, and at
 * `crash.ejectKmh` or more the rider is thrown off, flies, lands, slides, gets up and goes back
 * to levitating (or standing). Hard braking never counts as an impact.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import type { PlayerInput } from '../../src/simulation/contracts.js'
import { parseScene } from '../../src/scene/document.js'
import { ejectionDefaults, twoWheeledDefaults } from '../../src/config/simulation.js'
import { startEjection, stepEjection } from '../../src/simulation/rider-ejection.js'
import { finishStartUp } from '../start-up.js'

let sim: Simulation | undefined
afterEach(() => {
  sim?.dispose()
  sim = undefined
})

/** A long floor with a knee-high barrier across the road at `barrierZ` (none when null). */
function ride(barrierZ: number | null, playerMode: 'hover' | 'walk' = 'hover') {
  const floor = createEntity('floor', 'box', [0, -0.5, -2000])
  floor.size = [10000, 1, 10000]
  const entities = [floor, presetVehicle('vfr800', 'bike', [0, 0.6, 0])]
  if (barrierZ !== null) {
    const barrier = createEntity('barrier', 'box', [0, 0.4, barrierZ])
    barrier.size = [400, 0.8, 1]
    entities.push(barrier)
  }
  entities.push(createEntity('spawn', 'spawn', [3, 1, 4]))
  sim = new Simulation(parseScene({ version: 1, name: 'Crash', entities }), { playerMode })
  const s = sim
  for (let i = 0; i < 60; i++) s.step(1 / 60)
  s.startInVehicle('bike')
  finishStartUp(s)
  const pose = () => s.twoWheeledPose('bike')!
  const kmh = () => s.vehicleInfo('bike').speedKmh
  const tick = (input: Partial<PlayerInput> = {}) => {
    s.setInput({ ...idleInput(), ...input })
    s.step(1 / 60)
  }
  /** Full throttle until the crash; the top speed before it, km/h. */
  const crashInto = () => {
    let top = 0
    for (let i = 0; i < 60 * 20 && !pose().crashed; i++) {
      top = Math.max(top, kmh())
      tick({ forward: 1 })
    }
    return top
  }
  return { s, pose, kmh, tick, crashInto }
}

const upY = ([x, , z]: number[]) => 1 - 2 * (x * x + z * z)

describe('impact crash', () => {
  it('tumbles the machine; below the eject speed the rider stays on', () => {
    const { s, pose, tick, crashInto } = ride(-60)
    const speed = crashInto()
    expect(speed).toBeGreaterThan(twoWheeledDefaults.crash.minKmh)
    expect(speed).toBeLessThan(twoWheeledDefaults.crash.ejectKmh)
    expect(pose().crashed).toBe(true)
    let lowest = 1
    for (let i = 0; i < 90; i++) {
      tick()
      lowest = Math.min(lowest, upY(s.entityTransform('bike').rotation))
      expect(s.player.vehicleId).toBe('bike')
      expect(s.playerEjection).toBeNull()
    }
    // Violent: it goes over onto its back, not just onto its side.
    expect(lowest).toBeLessThan(0)
    // Crashed until R.
    for (let i = 0; i < 180; i++) tick({ forward: 1 })
    expect(pose().crashed).toBe(true)
  })

  it('throws the rider off at eject speed: flight, hit, slide, get up, levitate again', () => {
    const { s, pose, tick, crashInto } = ride(-150)
    const speed = crashInto()
    expect(speed).toBeGreaterThan(twoWheeledDefaults.crash.ejectKmh)
    expect(pose().crashed).toBe(true)
    expect(s.player.vehicleId).toBeNull()
    expect(s.playerEjection?.phase).toBe('flying')
    const phases: string[] = []
    let farthest = 0
    let hit = 0
    for (let i = 0; i < 60 * 15 && s.playerEjection; i++) {
      // Input is ignored while thrown.
      tick({ forward: 1, right: 1, jump: true })
      const e = s.playerEjection
      if (e && phases.at(-1) !== e.phase) phases.push(e.phase)
      if (e) hit = Math.max(hit, e.hit)
      farthest = Math.min(farthest, s.player.position[2])
    }
    expect(phases).toEqual(['flying', 'down', 'rising'])
    expect(s.playerEjection).toBeNull()
    expect(hit).toBeGreaterThan(10)
    // Carried on over the barrier, well past it.
    expect(farthest).toBeLessThan(-150 - 30)
    // Back on the hover cushion, still, and in control again.
    for (let i = 0; i < 60; i++) tick()
    expect(s.player.position[1]).toBeGreaterThan(1.1)
    expect(s.player.position[1]).toBeLessThan(1.4)
    expect(s.player.speed).toBeLessThan(0.5)
    const z = s.player.position[2]
    for (let i = 0; i < 60; i++) tick({ forward: 1 })
    expect(Math.abs(s.player.position[2] - z)).toBeGreaterThan(2)
  })

  it('a walking rider stands back up', () => {
    const { s, tick, crashInto } = ride(-150, 'walk')
    crashInto()
    expect(s.playerEjection).not.toBeNull()
    for (let i = 0; i < 60 * 15 && s.playerEjection; i++) tick()
    expect(s.playerEjection).toBeNull()
    for (let i = 0; i < 30; i++) tick()
    expect(s.player.position[1]).toBeCloseTo(0.9, 1)
  })

  it('hard braking from speed is not an impact', () => {
    const { pose, kmh, tick } = ride(null)
    for (let i = 0; i < 60 * 20 && kmh() < 150; i++) tick({ forward: 1 })
    expect(kmh()).toBeGreaterThan(150)
    for (let i = 0; i < 60 * 8; i++) tick({ forward: -1, brake: true })
    expect(kmh()).toBeLessThan(5)
    expect(pose().crashed).toBe(false)
  })
})

describe('ejection phases', () => {
  const dt = 1 / 60
  it('lands only after the first moments, rests, rises, then returns control', () => {
    let e = startEjection('bike', 40)
    // Touching the machine right at the throw is not the landing.
    e = stepEjection(e, true, 30, 30, dt)!
    expect(e.phase).toBe('flying')
    for (let t = 0; t < ejectionDefaults.minFlightSeconds; t += dt)
      e = stepEjection(e, false, 30, 30, dt)!
    e = stepEjection(e, true, 25, 20, dt)!
    expect(e).toMatchObject({ phase: 'down', hit: 25 })
    // Still sliding: no rest yet.
    for (let i = 0; i < 300; i++) e = stepEjection(e, true, 5, 5, dt)!
    expect(e.phase).toBe('down')
    let n = 0
    while (e.phase === 'down') {
      e = stepEjection(e, true, 0.1, 0.1, dt)!
      n++
    }
    expect(n * dt).toBeCloseTo(ejectionDefaults.downSeconds, 1)
    expect(e.phase).toBe('rising')
    let next: ReturnType<typeof stepEjection> = e
    n = 0
    while (next) {
      next = stepEjection(next, true, 0, 0, dt)
      n++
    }
    expect(n * dt).toBeCloseTo(ejectionDefaults.riseSeconds, 1)
  })

  it('gets up after maxSeconds even without landing', () => {
    let e = startEjection('bike', 40)
    for (let t = 0; t < ejectionDefaults.maxSeconds + dt; t += dt)
      e = stepEjection(e, false, 50, 50, dt)!
    expect(e.phase).toBe('rising')
  })
})
