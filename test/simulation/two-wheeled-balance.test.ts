import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import {
  balanceActive,
  equilibriumLean,
  groundSteerAngle,
  groundSteerLimitForLean,
  handlebarForGroundSteer,
  handlebarTarget,
  leanAcceleration,
  leanControlFrequency,
  leanRate,
  measureLean,
  steeringRakeCosine,
  targetLean,
  updateDisturbance,
} from '../../src/simulation/vehicles/two-wheeled/balance.js'

const g = 9.81,
  L = 1.44
const axis = [0, 0.9106, 0.4133] as const
const rake = steeringRakeCosine(axis)

describe('single-track steering geometry', () => {
  it('reads the rake of the authored VFR steering axis (~24.4°)', () => {
    expect((Math.acos(rake) * 180) / Math.PI).toBeCloseTo(24.41, 1)
    expect(steeringRakeCosine([0, 1, 0])).toBe(1)
    expect(() => steeringRakeCosine([0, 0, 0])).toThrow()
  })

  it('maps handlebar to ground steer through the rake and back', () => {
    for (const bar of [-0.6, -0.2, 0, 0.1, 0.61]) {
      const ground = groundSteerAngle(bar, rake)
      expect(Math.abs(ground)).toBeLessThanOrEqual(Math.abs(bar) + 1e-12)
      expect(Math.sign(ground)).toBe(Math.sign(bar))
      expect(handlebarForGroundSteer(ground, rake)).toBeCloseTo(bar, 12)
    }
    expect(groundSteerAngle(0.3, 1)).toBeCloseTo(0.3, 12)
  })
})

describe('lean targets', () => {
  it('matches tan(lean) = v²·tan(steer)/(g·L), left-positive, zero at standstill', () => {
    const v = 20,
      steer = 0.02
    expect(Math.tan(equilibriumLean(v, steer, L, g))).toBeCloseTo(
      (v * v * Math.tan(steer)) / (g * L),
      12,
    )
    expect(equilibriumLean(v, -steer, L, g)).toBeCloseTo(-equilibriumLean(v, steer, L, g), 12)
    expect(equilibriumLean(0, 0.5, L, g)).toBe(0)
    // A 40° turn at 20 m/s.
    const limit = groundSteerLimitForLean(v, L, 0.7, g)
    expect(equilibriumLean(v, limit, L, g)).toBeCloseTo(0.7, 12)
    expect(targetLean({ speed: v, groundSteer: 0.5, wheelbase: L, gravity: g, maxLean: 0.7 })).toBe(
      0.7,
    )
  })

  it('full input asks for full lock at walking pace and exactly maxLean at speed', () => {
    const limits = { steerLimit: 0.61, maxLean: 0.7, rakeCosine: rake, wheelbase: L, gravity: g }
    // Right input turns the bar right (negative, Rapier convention).
    expect(handlebarTarget(1, 0, limits)).toBeCloseTo(-0.61, 12)
    expect(handlebarTarget(-1, 1, limits)).toBeCloseTo(0.61, 12)
    for (const speed of [10, 25, 50]) {
      const bar = handlebarTarget(-1, speed, limits)
      expect(bar).toBeLessThan(0.61)
      const lean = equilibriumLean(speed, groundSteerAngle(bar, rake), L, g)
      expect(lean).toBeCloseTo(0.7, 9)
      expect(handlebarTarget(-0.5, speed, limits)).toBeCloseTo(bar / 2, 12)
    }
  })
})

describe('lean controller', () => {
  const gains = { balanceSpeed: 3, leanResponse: 5, assistResponse: 8 }

  it('uses the stiff assist below balanceSpeed and blends to the riding response', () => {
    expect(leanControlFrequency(0, gains)).toBe(8)
    expect(leanControlFrequency(3, gains)).toBe(8)
    expect(leanControlFrequency(4.5, gains)).toBeCloseTo(6.5, 12)
    expect(leanControlFrequency(30, gains)).toBe(5)
    expect(leanControlFrequency(-30, gains)).toBe(5)
  })

  it('is active with the assist, or above balanceSpeed without it, and never once fallen', () => {
    expect(balanceActive(0, false, true, 3)).toBe(true)
    expect(balanceActive(1, false, false, 3)).toBe(false)
    expect(balanceActive(5, false, false, 3)).toBe(true)
    expect(balanceActive(5, true, true, 3)).toBe(false)
  })

  it('commands a bounded, damped roll acceleration towards the target', () => {
    const base = {
      lean: 0,
      leanRate: 0,
      target: 0.3,
      frequency: 5,
      dampingRatio: 1,
      disturbance: 0,
      maxAcceleration: 60,
    }
    expect(leanAcceleration(base)).toBeCloseTo(25 * 0.3, 12)
    expect(leanAcceleration({ ...base, leanRate: 1 })).toBeCloseTo(7.5 - 10, 12)
    expect(leanAcceleration({ ...base, disturbance: 4 })).toBeCloseTo(3.5, 12)
    expect(leanAcceleration({ ...base, target: 10 })).toBe(60)
    expect(leanAcceleration({ ...base, target: -10 })).toBe(-60)
  })

  it('converges with no steady error on a lean plant with a constant disturbance', () => {
    // φ̈ = u + d: the controller plus observer must hold the target despite d.
    let lean = 0,
      rate = 0,
      estimate = 0,
      command = 0,
      previousRate: number | null = null
    const dt = 1 / 60,
      d = 12
    for (let i = 0; i < 600; i++) {
      if (previousRate !== null)
        estimate = updateDisturbance(estimate, (rate - previousRate) / dt, command, dt, 20, 180)
      previousRate = rate
      command = leanAcceleration({
        lean,
        leanRate: rate,
        target: 0.5,
        frequency: 5,
        dampingRatio: 1,
        disturbance: estimate,
        maxAcceleration: 60,
      })
      rate += (command + d) * dt
      lean += rate * dt
    }
    expect(lean).toBeCloseTo(0.5, 3)
    expect(estimate).toBeCloseTo(d, 2)
  })

  it('bounds and low-passes the disturbance estimate', () => {
    expect(updateDisturbance(0, 1000, 0, 1 / 60, 20, 180)).toBeLessThan(180)
    expect(updateDisturbance(5, 0, 0, 0, 20, 180)).toBe(5)
  })
})

describe('lean measurement', () => {
  const pose = (yaw: number, lean: number, pitch = 0) =>
    new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), yaw)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), lean))
  const measure = (q: Quaternion, gravityUp = new Vector3(0, 1, 0)) =>
    measureLean(
      new Vector3(0, 0, -1).applyQuaternion(q).toArray(),
      new Vector3(0, 1, 0).applyQuaternion(q).toArray(),
      gravityUp.toArray(),
    )

  it('measures left-positive lean for any heading and modest pitch', () => {
    for (const yaw of [0, 1, -2.5])
      for (const lean of [-0.9, -0.3, 0, 0.4, 1.1]) {
        expect(measure(pose(yaw, lean)).lean).toBeCloseTo(lean, 9)
        expect(Math.abs(measure(pose(yaw, lean, 0.1)).lean - lean)).toBeLessThan(0.02)
      }
    // Rotation about +Z (the chassis back axis) tips the top towards −X: lean left.
    const right = measure(pose(0, 0.3)).right
    expect(right[0]).toBeCloseTo(1, 12)
    expect(Math.hypot(right[1], right[2])).toBeCloseTo(0, 12)
  })

  it('measures against a tilted (planetary) vertical', () => {
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.4)
    const q = tilt.clone().multiply(pose(0.7, 0.25))
    expect(measure(q, new Vector3(0, 1, 0).applyQuaternion(tilt)).lean).toBeCloseTo(0.25, 9)
  })

  it('reads roll rate about the horizontal heading, left-positive', () => {
    const heading = [0, 0, -1] as const
    // Spinning about +Z (backwards) leans the machine left.
    expect(leanRate([0, 0, 2], heading)).toBe(2)
    expect(leanRate([0, 3, 0], heading)).toBeCloseTo(0, 12)
  })
})
