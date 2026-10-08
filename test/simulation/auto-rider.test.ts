/** Automatic rider input, the key hand-over and the tuck behind the windscreen. */
import { describe, expect, it } from 'vitest'
import {
  autoRiderInput,
  autoTuckLatch,
  manualTuckReach,
  stepRiderControl,
  tuckTarget,
  type AutoRiderInput,
} from '../../src/simulation/vehicles/two-wheeled/rider.js'
import { twoWheeledDefaults } from '../../src/config/simulation.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import type { PlayerInput } from '../../src/simulation/contracts.js'
import { parseScene } from '../../src/scene/document.js'
import { finishStartUp } from '../start-up.js'

const auto = twoWheeledDefaults.rider.auto
const cruise: AutoRiderInput = {
  lean: 0,
  maxLean: 0.7,
  steering: 0,
  acceleration: 0,
  gravity: 9.81,
  throttle: 0.3,
  lever: 0,
}

describe('automatic rider input', () => {
  it('sits centred when cruising', () => {
    expect(autoRiderInput(cruise, auto)).toEqual([0, 0])
    expect(autoRiderInput({ ...cruise, lean: auto.leanDeadband * 0.5 }, auto)).toEqual([0, 0])
  })

  it('hangs off to the inside in proportion to lean', () => {
    const left = autoRiderInput({ ...cruise, lean: 0.4 }, auto)[0]
    const more = autoRiderInput({ ...cruise, lean: 0.6 }, auto)[0]
    expect(left).toBeLessThan(0)
    expect(more).toBeLessThan(left)
    expect(autoRiderInput({ ...cruise, lean: -0.4 }, auto)[0]).toBeCloseTo(-left, 9)
  })

  it('moves forward under hard acceleration and back under hard front braking', () => {
    const accel = autoRiderInput({ ...cruise, throttle: 1, acceleration: 6 }, auto)[1]
    const brake = autoRiderInput({ ...cruise, throttle: 0, lever: 1, acceleration: -8 }, auto)[1]
    expect(accel).toBeGreaterThan(0.5)
    expect(brake).toBeLessThan(-0.5)
    // Engine braking or drag alone (no lever) does not move the rider back.
    expect(autoRiderInput({ ...cruise, throttle: 0, acceleration: -3 }, auto)[1]).toBe(0)
  })

  it('does nothing when disabled', () => {
    expect(
      autoRiderInput(
        { ...cruise, lean: 0.6, acceleration: 8, throttle: 1 },
        {
          ...auto,
          enabled: false,
        },
      ),
    ).toEqual([0, 0])
  })
})

describe('key hand-over', () => {
  const run = (
    state: { manualShare: number; manualHold: number },
    keys: boolean,
    seconds: number,
  ) => {
    for (let t = 0; t < seconds; t += 1 / 60) state = stepRiderControl(state, keys, auto, 1 / 60)
    return state
  }

  it('keys take over quickly and hand back after the release delay', () => {
    let s = run({ manualShare: 0, manualHold: 0 }, true, auto.takeover + 0.02)
    expect(s.manualShare).toBe(1)
    s = run(s, false, auto.releaseDelay * 0.9)
    expect(s.manualShare).toBe(1)
    s = run(s, false, auto.releaseDelay * 0.1 + auto.blend + 0.05)
    expect(s.manualShare).toBe(0)
  })

  it('stays on the keys when the automatic rider is disabled', () => {
    expect(
      stepRiderControl({ manualShare: 0, manualHold: 0 }, false, { ...auto, enabled: false }, 0.1)
        .manualShare,
    ).toBe(1)
  })
})

describe('tuck behind the windscreen', () => {
  const tuck = twoWheeledDefaults.rider.tuck

  it('latches on at the tuck speed and only releases below the release speed', () => {
    expect(autoTuckLatch(false, tuck.kmh - 1, 0, tuck)).toBe(false)
    expect(autoTuckLatch(false, tuck.kmh, 0, tuck)).toBe(true)
    // Hysteresis: between the two speeds the latch keeps its state.
    const between = (tuck.kmh + tuck.releaseKmh) / 2
    expect(autoTuckLatch(true, between, 0, tuck)).toBe(true)
    expect(autoTuckLatch(false, between, 0, tuck)).toBe(false)
    expect(autoTuckLatch(true, tuck.releaseKmh - 0.5, 0, tuck)).toBe(false)
    // Hard braking sits the rider up at any speed.
    expect(autoTuckLatch(true, 220, tuck.brakeG + 0.1, tuck)).toBe(false)
  })

  it('lets the forward key reach the full tuck only at speed, blending in without a jump', () => {
    expect(manualTuckReach(tuck.manualFromKmh - 1, tuck)).toBe(0)
    expect(manualTuckReach(tuck.kmh, tuck)).toBe(1)
    let previous = 0
    for (let kmh = tuck.manualFromKmh; kmh <= tuck.kmh; kmh += 0.5) {
      const reach = manualTuckReach(kmh, tuck)
      expect(reach).toBeGreaterThanOrEqual(previous)
      expect(reach - previous).toBeLessThan(0.1)
      previous = reach
    }
    // Keys own the tuck while they are pressed: no tuck below the blend even when latched.
    expect(tuckTarget(true, 1, 120, 1, tuck)).toBe(0)
    expect(tuckTarget(false, 1, 200, 1, tuck)).toBe(1)
    expect(tuckTarget(true, 0, 200, 0, tuck)).toBe(1)
  })

  it('tucks on the vfr800 above the tuck speed and sits up under hard braking', () => {
    const r = rideVfr()
    let guard = 0
    while (r.pose().roadSpeed * 3.6 < tuck.kmh + 5 && guard++ < 40 * 60) r.step({ forward: 1 })
    for (let i = 0; i < 60; i++) r.step({ forward: 1 })
    expect(r.pose().tuck).toBeGreaterThan(0.95)
    for (let i = 0; i < 45; i++) r.step({ forward: -1 })
    expect(r.pose().tuck).toBeLessThan(0.5)
    r.dispose()
  })

  it('keeps the normal forward-key range below the tuck blend', () => {
    const r = rideVfr()
    for (let i = 0; i < 4 * 60; i++) r.step({ forward: 1 })
    expect(r.pose().roadSpeed * 3.6).toBeLessThan(tuck.manualFromKmh)
    for (let i = 0; i < 60; i++) r.step({ forward: 0.3, riderForward: 1 })
    expect(r.pose().tuck).toBe(0)
    r.dispose()
  })
})

function rideVfr() {
  const floor = createEntity('floor', 'box', [0, -0.5, -4000])
  floor.size = [10000, 1, 10000]
  const bike = presetVehicle('vfr800', 'bike', [0, 0.6, 0])
  const s = new Simulation(
    parseScene({
      version: 1,
      name: 'Tuck',
      entities: [floor, bike, createEntity('spawn', 'spawn', [3, 1, 4])],
    }),
  )
  for (let i = 0; i < 60; i++) s.step(1 / 60)
  s.startInVehicle('bike')
  finishStartUp(s)
  return {
    pose: () => s.twoWheeledPose('bike')!,
    step: (input: Partial<PlayerInput>) => {
      s.setInput({ ...idleInput(), ...input })
      s.step(1 / 60)
    },
    dispose: () => s.dispose(),
  }
}
