/** Automatic rider input, the key hand-over and the tuck behind the windscreen. */
import { describe, expect, it } from 'vitest'
import {
  autoRiderInput,
  autoTuckDepth,
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

  it('ramps the head down from 180 to 200 km/h, eased, with no step', () => {
    expect(tuck.kmh).toBe(180)
    expect(tuck.fullKmh).toBe(200)
    expect(autoTuckDepth(0, tuck.kmh - 1, 0, tuck)).toBe(0)
    expect(autoTuckDepth(0, tuck.kmh, 0, tuck)).toBe(0)
    expect(autoTuckDepth(0, 190, 0, tuck)).toBeCloseTo(0.5, 6)
    expect(autoTuckDepth(0, tuck.fullKmh, 0, tuck)).toBe(1)
    let depth = 0
    let previous = 0
    for (let kmh = 150; kmh <= 230; kmh += 0.25) {
      depth = autoTuckDepth(depth, kmh, 0, tuck)
      expect(depth).toBeGreaterThanOrEqual(previous)
      // Eased: never more than a small change per 0.25 km/h, flat at both ends.
      expect(depth - previous).toBeLessThan(0.02)
      previous = depth
    }
    expect(autoTuckDepth(0, tuck.kmh + 0.5, 0, tuck)).toBeLessThan(0.01)
    expect(1 - autoTuckDepth(0, tuck.fullKmh - 0.5, 0, tuck)).toBeLessThan(0.01)
  })

  it('keeps hysteresis on the way down and sits up under hard braking', () => {
    const gap = tuck.kmh - tuck.releaseKmh
    expect(gap).toBeGreaterThan(0)
    // Slowing from a full tuck: still full until fullKmh - gap, then the ramp shifted down.
    let depth = 1
    let previous = 1
    for (let kmh = 230; kmh >= 150; kmh -= 0.25) {
      depth = autoTuckDepth(depth, kmh, 0, tuck)
      expect(depth).toBeLessThanOrEqual(previous)
      expect(previous - depth).toBeLessThan(0.02)
      if (kmh >= tuck.fullKmh - gap) expect(depth).toBe(1)
      if (kmh >= tuck.kmh && kmh <= tuck.fullKmh) {
        // Higher than on the way up at the same speed.
        expect(depth).toBeGreaterThanOrEqual(autoTuckDepth(0, kmh, 0, tuck))
      }
      previous = depth
    }
    expect(autoTuckDepth(1, tuck.releaseKmh, 0, tuck)).toBe(0)
    // In the band the depth holds: half a tuck at 185 km/h stays half.
    expect(autoTuckDepth(0.5, 185, 0, tuck)).toBe(0.5)
    expect(autoTuckDepth(1, 220, tuck.brakeG + 0.1, tuck)).toBe(0)
  })

  it('lets the forward key follow the same 180 → 200 km/h ramp', () => {
    expect(manualTuckReach(tuck.kmh, tuck)).toBe(0)
    expect(manualTuckReach(tuck.fullKmh, tuck)).toBe(1)
    for (let kmh = 150; kmh <= 230; kmh += 0.5)
      expect(manualTuckReach(kmh, tuck)).toBeCloseTo(autoTuckDepth(0, kmh, 0, tuck), 9)
    // Keys own the tuck while they are pressed: no tuck below the ramp even with an auto depth.
    expect(tuckTarget(1, 1, 120, 1, tuck)).toBe(0)
    expect(tuckTarget(0, 1, 205, 1, tuck)).toBe(1)
    expect(tuckTarget(1, 0, 205, 0, tuck)).toBe(1)
    expect(tuckTarget(0, 1, 190, 1, tuck)).toBeCloseTo(0.5, 6)
  })

  it('tucks on the vfr800 above the tuck speed and sits up under hard braking', () => {
    const r = rideVfr()
    let guard = 0
    while (r.pose().roadSpeed * 3.6 < tuck.kmh + 3 && guard++ < 40 * 60) r.step({ forward: 1 })
    // Just past the start of the ramp: only a little head movement.
    for (let i = 0; i < 60; i++) r.step({ forward: 1 })
    if (r.pose().roadSpeed * 3.6 < tuck.kmh + 8) expect(r.pose().tuck).toBeLessThan(0.5)
    while (r.pose().roadSpeed * 3.6 < tuck.fullKmh + 3 && guard++ < 60 * 60) r.step({ forward: 1 })
    for (let i = 0; i < 60; i++) r.step({ forward: 1 })
    expect(r.pose().tuck).toBeGreaterThan(0.95)
    for (let i = 0; i < 45; i++) r.step({ forward: -1 })
    expect(r.pose().tuck).toBeLessThan(0.5)
    r.dispose()
  })

  it('keeps the normal forward-key range below the tuck ramp', () => {
    const r = rideVfr()
    for (let i = 0; i < 4 * 60; i++) r.step({ forward: 1 })
    expect(r.pose().roadSpeed * 3.6).toBeLessThan(tuck.kmh)
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
