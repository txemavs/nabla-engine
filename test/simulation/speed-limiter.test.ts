import { describe, expect, it } from 'vitest'
import { applySpeedLimiter, createDrivetrain } from '../../src/simulation/vehicles/drivetrain.js'
import type { PowertrainDefinition } from '../../src/simulation/vehicles/wheeled/contracts.js'
import { roadVehicleDefaults } from '../../src/config/simulation.js'

const spec = (speedLimiter?: PowertrainDefinition['speedLimiter']): PowertrainDefinition => ({
  powerCv: 110,
  torqueNm: 82,
  ratios: [2],
  finalDrive: 4,
  grip: 4,
  speedLimiter,
})
const kmh = (value: number) => value / 3.6

describe('soft speed limiter', () => {
  it('cuts drive and load at the limit and resumes only below the hysteresis band', () => {
    const state = createDrivetrain()
    const limited = spec({ kmh: 250, hysteresisKmh: 3 })
    const drive = (speed: number) => {
      state.force = 900
      state.load = 1
      applySpeedLimiter(state, limited, kmh(speed))
      return state.force
    }
    expect(drive(240)).toBe(900)
    expect(drive(250)).toBe(0)
    expect(state.load).toBe(0)
    expect(state.limiterCut).toBe(true)
    // Still inside the band: stays cut (ignition-cut style, not a per-tick wall).
    expect(drive(248)).toBe(0)
    expect(drive(246.5)).toBe(900)
    expect(state.limiterCut).toBe(false)
    expect(drive(249.9)).toBe(900)
  })

  it('uses the default hysteresis and does nothing without a limiter', () => {
    const state = createDrivetrain()
    state.force = 500
    applySpeedLimiter(state, spec({ kmh: 100 }), kmh(101))
    expect(state.force).toBe(0)
    state.force = 500
    applySpeedLimiter(
      state,
      spec({ kmh: 100 }),
      kmh(100 - roadVehicleDefaults.limiterHysteresisKmh),
    )
    expect(state.force).toBe(500)
    state.force = 500
    applySpeedLimiter(state, spec(), kmh(300))
    expect(state.force).toBe(500)
    expect(state.limiterCut).toBe(false)
  })

  it('never touches braking or reverse force', () => {
    const state = createDrivetrain()
    state.limiterCut = true
    state.force = -400
    applySpeedLimiter(state, spec({ kmh: 50 }), kmh(60))
    expect(state.force).toBe(-400)
  })
})
