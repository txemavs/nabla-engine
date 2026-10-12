import { describe, expect, it } from 'vitest'
import { stickFromOffset, walkFromStick } from '../../src/runtime/touch-walk.js'
import { lightTuningDefaults } from '../../src/runtime/light-tuning.js'

describe('on-foot touch sticks', () => {
  it('clamps the pointer offset to the unit circle', () => {
    expect(stickFromOffset(0, 0, 40)).toEqual({ x: 0, y: 0 })
    expect(stickFromOffset(20, -20, 40)).toEqual({ x: 0.5, y: -0.5 })
    const far = stickFromOffset(400, 0, 40)
    expect(far.x).toBeCloseTo(1)
    expect(far.y).toBeCloseTo(0)
    const diag = stickFromOffset(100, 100, 40)
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1)
    expect(stickFromOffset(Number.NaN, 0, 40)).toEqual({ x: 0, y: 0 })
  })

  it('maps the move stick to walking: screen up is forward, right strafes right', () => {
    expect(walkFromStick({ x: 0, y: -1 })).toEqual({ forward: 1, right: 0 })
    expect(walkFromStick({ x: 0.5, y: 0.25 })).toEqual({ forward: -0.25, right: 0.5 })
  })
})

describe('Luz defaults', () => {
  it('Reflejos starts at x0.10', () => {
    expect(lightTuningDefaults.reflections).toBe(0.25)
  })
})
