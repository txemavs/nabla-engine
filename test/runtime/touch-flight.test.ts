import { describe, expect, it } from 'vitest'
import { flightFromMode2, TouchFlight } from '../../src/runtime/touch-flight.js'

describe('flightFromMode2', () => {
  it('maps Agency Mode 2 sticks onto nabla flight axes', () => {
    expect(flightFromMode2({ yaw: 1, throttle: 1, roll: -1, pitch: 0.5 })).toEqual({
      turn: 1,
      lift: 1,
      right: -1,
      forward: 0.5,
    })
    expect(flightFromMode2({ yaw: 0, throttle: 0.5, roll: 0, pitch: 0 })).toEqual({
      turn: 0,
      lift: 0,
      right: 0,
      forward: 0,
    })
    expect(flightFromMode2({ yaw: 0, throttle: 0, roll: 0, pitch: -1 }).lift).toBe(-1)
  })
})

describe('TouchFlight', () => {
  it('exposes Mode 2 sticks and hides when inactive', () => {
    const host = document.createElement('div')
    const flight = new TouchFlight(host, {
      interact: () => undefined,
      camera: () => undefined,
    }, 'always')
    expect(host.querySelector('.touch-flight')).toBeTruthy()
    expect(host.querySelectorAll('.touch-flight-stick')).toHaveLength(2)
    flight.setActive(true)
    expect(flight.root.hidden).toBe(false)
    expect(flight.input()).toEqual({ forward: 0, right: 0, lift: 0, turn: 0, brake: false })
    flight.setActive(false)
    expect(flight.root.hidden).toBe(true)
    flight.dispose()
    expect(host.querySelector('.touch-flight')).toBeNull()
  })
})
