import { describe, expect, it } from 'vitest'
import { vehicleGroupVisibility } from '../../game/vehicle-group.js'
import type { VehicleOptions } from '../../src/runtime/vehicle-options.js'
import { vehicleOptions } from '../../src/runtime/vehicle-options.js'
import type { VehicleDefinition } from '../../src/entity/vehicle/field.js'

const lamps = { front: true, rear: true }

describe('vehicle group visibility', () => {
  it('lists every section on foot', () => {
    const show = vehicleGroupVisibility(null)
    expect(Object.values(show.sections).every(Boolean)).toBe(true)
  })

  it('hides what a vehicle does not have', () => {
    const options: VehicleOptions = {
      lamps: { front: false, rear: false },
      mirrors: false,
      exhaust: null,
      sound: { engine: false, reverseAlarm: false },
    }
    const show = vehicleGroupVisibility({ options })
    expect(show.sections).toEqual({
      'settings-options-driver': true,
      'settings-car-beams': false,
      'settings-vehicle-sound': false,
      'settings-truck-exhaust': false,
      'settings-rear-light-nudge': false,
    })
    expect(show.mirrors).toBe(false)
  })

  it('shows exhaust rows by what the data adjusts', () => {
    const position = vehicleGroupVisibility({
      options: {
        lamps,
        mirrors: true,
        exhaust: { position: true, amount: false, follows: 'load' },
        sound: { engine: true, reverseAlarm: true },
      },
    })
    expect(position.sections['settings-truck-exhaust']).toBe(true)
    expect(position.exhaustPosition).toBe(true)
    expect(position.exhaustAmount).toBe(false)
    expect(position.reverseAlarm).toBe(true)
    const fixed = vehicleGroupVisibility({
      options: {
        lamps,
        mirrors: true,
        exhaust: { position: false, amount: false, follows: 'rpm' },
        sound: { engine: true, reverseAlarm: false },
      },
    })
    expect(fixed.sections['settings-truck-exhaust']).toBe(false)
  })
})

describe('vehicleOptions', () => {
  const parse = (extra: object) => extra as VehicleDefinition

  it('reads the exhaust and sound flags from the vehicle data', () => {
    const facts = { lamps, mirrors: true, exhaust: true }
    const truck = vehicleOptions(
      parse({ reverseAlarm: true, exhaust: { adjustable: true, smoke: { amount: 'manual' } } }),
      facts,
    )
    expect(truck.exhaust).toEqual({ position: true, amount: true, follows: 'manual' })
    expect(truck.sound).toEqual({ engine: true, reverseAlarm: true })
    const car = vehicleOptions(parse({}), { ...facts, exhaust: false })
    expect(car.exhaust).toBeNull()
    expect(car.sound.reverseAlarm).toBe(false)
  })

  it('gives passive vehicles no engine voice', () => {
    const trailer = vehicleOptions(parse({ passive: true }), {
      lamps,
      mirrors: false,
      exhaust: false,
    })
    expect(trailer.sound.engine).toBe(false)
  })
})
