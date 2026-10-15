import { describe, expect, it } from 'vitest'
import {
  MODE_US,
  mixMotors,
  mode2Channels,
  modeFromUs,
  QUAD_X_MIXER,
  throttleToUs,
  unitToUs,
  usToUnit,
} from '../../src/experimental/betaflight/droneDef.js'

describe('droneDef Mode 2', () => {
  it('maps sticks to 8 channels', () => {
    const ch = mode2Channels({
      roll: 1,
      pitch: -1,
      throttle: 0.5,
      yaw: -1,
      arm: true,
      mode: 'loiter',
    })
    expect(ch).toHaveLength(8)
    expect(ch[0]).toBe(unitToUs(1))
    expect(ch[2]).toBe(throttleToUs(0.5))
    expect(ch[4]).toBe(2000)
    expect(ch[5]).toBe(MODE_US.loiter)
    expect(usToUnit(ch[0] ?? 1500)).toBeCloseTo(1)
  })

  it('reads mode from aux µs', () => {
    expect(modeFromUs(1100)).toBe('acro')
    expect(modeFromUs(1400)).toBe('angle')
    expect(modeFromUs(1700)).toBe('loiter')
    expect(modeFromUs(1900)).toBe('auton')
  })

  it('mixes quad X', () => {
    const hover = mixMotors(0.5, 0, 0, 0, QUAD_X_MIXER)
    expect(hover.every((m) => Math.abs(m - 0.5) < 1e-9)).toBe(true)
    const rollR = mixMotors(0.5, 0.2, 0, 0)
    expect(rollR[1]).toBeGreaterThan(rollR[0] ?? 0)
  })
})
