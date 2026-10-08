import { describe, expect, it } from 'vitest'
import {
  axleLoads,
  balancePointAngle,
  measurePitch,
  pitchAssist,
  stoppieThresholdDeceleration,
  wheelieThresholdForce,
  type PitchAssistInput,
  type PitchGeometry,
} from '../../src/simulation/vehicles/two-wheeled/pitch.js'
import {
  combinedBrakeLevels,
  independentBrakes,
  stepCombinedBrakes,
  validBrakeSplit,
  type CombinedBrakeSplit,
} from '../../src/simulation/vehicles/two-wheeled/brakes.js'
import {
  hangOffLean,
  riderCentreOfMass,
  riderTarget,
  stepRider,
  type RiderLimits,
} from '../../src/simulation/vehicles/two-wheeled/rider.js'
import { twoWheeledDefaults } from '../../src/config/simulation.js'

// Round illustrative numbers, not VFR data.
const bike: PitchGeometry = {
  mass: 300,
  gravity: 9.81,
  comHeight: 0.6,
  comToRear: 0.7,
  comToFront: 0.75,
}

describe('wheelie / stoppie load transfer', () => {
  it('splits the static weight by the contact distances and always sums to m·g', () => {
    const still = axleLoads(bike, 0)
    expect(still.front + still.rear).toBeCloseTo(300 * 9.81, 9)
    expect(still.front / still.rear).toBeCloseTo(0.7 / 0.75, 9)
    for (const force of [-4000, -1000, 1500, 3000]) {
      const loads = axleLoads(bike, force)
      expect(loads.front + loads.rear).toBeCloseTo(300 * 9.81, 9)
      // Drive loads the rear, braking loads the front.
      expect(Math.sign(loads.rear - still.rear)).toBe(Math.sign(force))
    }
  })

  it('unloads the front exactly at the wheelie threshold force m·g·b/h', () => {
    const threshold = wheelieThresholdForce(bike)
    expect(threshold).toBeCloseTo((300 * 9.81 * 0.7) / 0.6, 9)
    expect(axleLoads(bike, threshold).front).toBeCloseTo(0, 6)
    expect(axleLoads(bike, threshold * 1.1).front).toBeLessThan(0)
    // A higher centre of mass (the rider sitting up / back) lowers the threshold.
    expect(wheelieThresholdForce({ ...bike, comHeight: 0.7 })).toBeLessThan(threshold)
    expect(wheelieThresholdForce({ ...bike, comToRear: 0.6 })).toBeLessThan(threshold)
  })

  it('unloads the rear exactly at the stoppie threshold deceleration g·a/h', () => {
    const decel = stoppieThresholdDeceleration(bike)
    expect(decel).toBeCloseTo((9.81 * 0.75) / 0.6, 9)
    expect(axleLoads(bike, -bike.mass * decel).rear).toBeCloseTo(0, 6)
    // Weight forward (shorter a) makes a stoppie easier.
    expect(stoppieThresholdDeceleration({ ...bike, comToFront: 0.6 })).toBeLessThan(decel)
  })

  it('rejects non-physical geometry', () => {
    expect(() => axleLoads({ ...bike, comHeight: 0 }, 0)).toThrow()
    expect(() => wheelieThresholdForce({ ...bike, mass: -1 })).toThrow()
    expect(() => balancePointAngle(0, 1)).toThrow()
  })

  it('puts the loop-out balance point where the CoM is over the contact', () => {
    expect(balancePointAngle(0.6, 0.6)).toBeCloseTo(Math.PI / 4, 12)
    expect(balancePointAngle(0.6, 0.7)).toBeCloseTo(Math.atan(0.7 / 0.6), 12)
  })

  it('measures nose-up pitch against the ground plane', () => {
    expect(measurePitch([0, 0, -1], [0, 1, 0])).toBeCloseTo(0, 12)
    const a = 0.3
    expect(measurePitch([0, Math.sin(a), -Math.cos(a)], [0, 1, 0])).toBeCloseTo(a, 12)
    expect(measurePitch([0, -Math.sin(a), -Math.cos(a)], [0, 2, 0])).toBeCloseTo(-a, 12)
    // On a slope the chassis parallel to the ground reads zero pitch.
    const n = [0, Math.cos(0.2), Math.sin(0.2)] as const
    expect(measurePitch([0, Math.sin(0.2), -Math.cos(0.2)], n)).toBeCloseTo(0, 12)
    expect(measurePitch([0, 0, -1], [0, 0, 0])).toBe(0)
  })
})

describe('pitch assist', () => {
  const base: PitchAssistInput = {
    angle: 0,
    rate: 0,
    softAngle: 0.26,
    maxAngle: 0.52,
    floor: 0,
    response: 6,
    dampingRatio: 1,
    landingRate: 2.5,
  }

  it('does nothing below the soft angle and with both wheels down', () => {
    for (const angle of [-0.1, 0, 0.1, 0.25])
      expect(pitchAssist({ ...base, angle })).toEqual({ scale: 1, acceleration: 0 })
  })

  it('fades the lifting force smoothly and monotonically to the floor at the max angle', () => {
    let previous = 1
    for (let angle = 0.26; angle <= 0.52; angle += 0.02) {
      const { scale, acceleration } = pitchAssist({ ...base, angle })
      expect(scale).toBeLessThanOrEqual(previous + 1e-12)
      expect(acceleration).toBe(0)
      previous = scale
    }
    expect(pitchAssist({ ...base, angle: 0.39 }).scale).toBeCloseTo(0.5, 12)
    expect(pitchAssist({ ...base, angle: 0.52 }).scale).toBeCloseTo(0, 12)
    expect(pitchAssist({ ...base, angle: 0.52, floor: 0.3 }).scale).toBeCloseTo(0.3, 12)
  })

  it('pulls the wheel back down past the max angle with a damped correction', () => {
    const still = pitchAssist({ ...base, angle: 0.62 })
    expect(still.acceleration).toBeCloseTo(-36 * 0.1, 9)
    const rising = pitchAssist({ ...base, angle: 0.62, rate: 1 })
    expect(rising.acceleration).toBeCloseTo(-36 * 0.1 - 12, 9)
  })

  it('cushions a fast landing but leaves a gentle one alone', () => {
    expect(pitchAssist({ ...base, angle: 0.2, rate: -1 }).acceleration).toBe(0)
    expect(pitchAssist({ ...base, angle: 0.2, rate: -4 }).acceleration).toBeCloseTo(12 * 1.5, 9)
  })

  it('looks ahead by the anticipation time while rising', () => {
    const plain = pitchAssist({ ...base, angle: 0.3, rate: 1 })
    const ahead = pitchAssist({ ...base, angle: 0.3, rate: 1, anticipation: 0.15 })
    expect(ahead.scale).toBeLessThan(plain.scale)
    expect(ahead.scale).toBeCloseTo(pitchAssist({ ...base, angle: 0.45 }).scale, 12)
  })

  it('rejects inverted angles', () => {
    expect(() => pitchAssist({ ...base, softAngle: 0.5, maxAngle: 0.4 })).toThrow()
    expect(() => pitchAssist({ ...base, softAngle: -0.1 })).toThrow()
  })

  it('ships defaults with soft < max for both manoeuvres', () => {
    const a = twoWheeledDefaults.pitchAssist
    expect(a.wheelieSoftAngle).toBeLessThan(a.wheelieMaxAngle)
    expect(a.stoppieSoftAngle).toBeLessThan(a.stoppieMaxAngle)
    expect(a.wheelieNeutralAngle).toBeLessThan(a.wheelieMaxAngle)
    expect(a.stoppieNeutralAngle).toBeLessThan(a.stoppieMaxAngle)
  })
})

describe('combined brake split (Dual CBS placeholder)', () => {
  const cbs: CombinedBrakeSplit = { ...twoWheeledDefaults.cbs }

  it('keeps independent brakes one control per wheel', () => {
    expect(combinedBrakeLevels(1, 0, independentBrakes)).toEqual({ front: 1, rear: 0 })
    expect(combinedBrakeLevels(0, 1, independentBrakes)).toEqual({ front: 0, rear: 1 })
    expect(combinedBrakeLevels(0.5, 0.25, independentBrakes)).toEqual({ front: 0.5, rear: 0.25 })
  })

  it('feeds both wheels from each control by the configured shares', () => {
    const lever = combinedBrakeLevels(1, 0, cbs)
    expect(lever.front).toBeCloseTo(cbs.leverFront, 12)
    expect(lever.rear).toBeCloseTo(cbs.leverRear, 12)
    const pedal = combinedBrakeLevels(0, 1, cbs)
    expect(pedal.front).toBeCloseTo(cbs.pedalFront, 12)
    expect(pedal.rear).toBeCloseTo(cbs.pedalRear, 12)
    // Both controls linked: each wheel still gets something from either.
    expect(lever.rear).toBeGreaterThan(0)
    expect(pedal.front).toBeGreaterThan(0)
  })

  it('caps each wheel at its full brake force and clamps inputs', () => {
    const both = combinedBrakeLevels(1, 1, cbs)
    expect(both.front).toBeLessThanOrEqual(1)
    expect(both.rear).toBeLessThanOrEqual(1)
    expect(combinedBrakeLevels(2, -1, cbs)).toEqual(combinedBrakeLevels(1, 0, cbs))
    const heavy = { ...cbs, leverFront: 1, pedalFront: 1 }
    expect(combinedBrakeLevels(1, 1, heavy).front).toBe(1)
  })

  it('validates the shares', () => {
    expect(validBrakeSplit(cbs)).toBe(true)
    expect(validBrakeSplit(independentBrakes)).toBe(true)
    expect(validBrakeSplit({ ...cbs, leverFront: 1.2 })).toBe(false)
    expect(validBrakeSplit({ ...cbs, linkLag: -1 })).toBe(false)
    expect(validBrakeSplit({ ...cbs, pedalFront: 0, pedalRear: 0 })).toBe(false)
  })

  it('applies the direct share at once and builds the linked share with the lag', () => {
    const state = { linkedRear: 0, linkedFront: 0 }
    const first = stepCombinedBrakes(state, 1, 0, cbs, 1 / 60)
    expect(first.front).toBeCloseTo(cbs.leverFront, 12)
    expect(first.rear).toBeGreaterThan(0)
    expect(first.rear).toBeLessThan(cbs.leverRear * 0.5)
    let last = first
    for (let i = 0; i < 120; i++) last = stepCombinedBrakes(state, 1, 0, cbs, 1 / 60)
    expect(last.rear).toBeCloseTo(cbs.leverRear, 6)
    // Released: the linked circuit bleeds off the same way.
    const released = stepCombinedBrakes(state, 0, 0, cbs, 1 / 60)
    expect(released.front).toBe(0)
    expect(released.rear).toBeGreaterThan(0)
    for (let i = 0; i < 120; i++) stepCombinedBrakes(state, 0, 0, cbs, 1 / 60)
    expect(state.linkedRear).toBeLessThan(1e-6)
    // Zero lag is the steady state immediately.
    const instant = { linkedRear: 0, linkedFront: 0 }
    expect(stepCombinedBrakes(instant, 0, 1, { ...cbs, linkLag: 0 }, 1 / 60)).toEqual(
      combinedBrakeLevels(0, 1, cbs),
    )
  })
})

describe('rider counterweight', () => {
  const limits: RiderLimits = { mass: 76, lateral: 0.25, forward: 0.2, back: 0.25, rate: 3 }

  it('maps the inputs to a chassis offset (z positive backwards)', () => {
    expect(riderTarget(0, 0, limits)).toEqual([0, -0])
    expect(riderTarget(1, 0, limits)).toEqual([0.25, -0])
    expect(riderTarget(-1, 1, limits)).toEqual([-0.25, -0.2])
    expect(riderTarget(0, -1, limits)).toEqual([0, 0.25])
    expect(riderTarget(5, Number.NaN, limits)).toEqual([0.25, -0])
  })

  it('moves the rider at the configured rate', () => {
    let shift: [number, number] = [0, 0]
    shift = stepRider(shift, [0.25, 0.25], limits, 0.1)
    expect(shift[0]).toBeCloseTo(0.075, 12)
    expect(shift[1]).toBeCloseTo(0.075, 12)
    for (let i = 0; i < 10; i++) shift = stepRider(shift, [0.25, 0.25], limits, 0.1)
    expect(shift).toEqual([0.25, 0.25])
  })

  it('moves the vehicle centre of mass by the rider mass share', () => {
    const seat = [0, 0.55, 0.31] as const
    const still = riderCentreOfMass(seat, [0, 0], 76, 310)
    expect(still[1]).toBeCloseTo((0.55 * 76) / 310, 12)
    const back = riderCentreOfMass(seat, [0, 0.25], 76, 310)
    expect(back[2] - still[2]).toBeCloseTo((0.25 * 76) / 310, 12)
    const right = riderCentreOfMass(seat, [0.25, 0], 76, 310)
    expect(right[0]).toBeCloseTo((0.25 * 76) / 310, 12)
    expect(() => riderCentreOfMass(seat, [0, 0], 310, 310)).toThrow()
  })

  it('turns a sideways CoM offset into a lean offset', () => {
    expect(hangOffLean(0, 0.65)).toBe(0)
    expect(hangOffLean(0.06, 0.65)).toBeCloseTo(Math.atan(0.06 / 0.65), 12)
    expect(hangOffLean(-0.06, 0.65)).toBeCloseTo(-hangOffLean(0.06, 0.65), 12)
    expect(hangOffLean(0.06, 0)).toBe(0)
  })
})
