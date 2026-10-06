import { describe, expect, it } from 'vitest'
import {
  hostSteeringWheelsFromSearch,
  parseHostSteeringWheels,
} from '../../game/host-steering-wheel.js'
import {
  WHEEL_RANGE_CM,
  describeWheel,
  formatWheelCm,
  wheelBakeValues,
} from '../../game/steering-wheel-controls.js'

describe('«Volante» host defaults (&wheel=)', () => {
  it('resolves preset ids to their steering GLB and keeps GLB URLs', () => {
    expect(
      parseHostSteeringWheels(
        JSON.stringify({
          car: { distance: 0.015, height: -0.005 },
          a3: { height: '0.01' },
          '/custom/wheel.glb': { distance: -0.08 },
        }),
      ),
    ).toEqual({
      '/library/cars/a3/s3.steering.glb': { distance: 0.015, height: -0.005 },
      '/library/cars/a3/a3.steering.glb': { distance: 0, height: 0.01 },
      '/custom/wheel.glb': { distance: -0.08, height: 0 },
    })
  })

  it('rejects typos instead of clamping them quietly', () => {
    expect(() => parseHostSteeringWheels('[')).toThrow(/JSON object/)
    expect(() => parseHostSteeringWheels('[]')).toThrow(/JSON object/)
    expect(() => parseHostSteeringWheels('{"nope":{}}')).toThrow(/Unknown vehicle preset/)
    expect(() => parseHostSteeringWheels('{"white-trailer":{}}')).toThrow(/no steering wheel/)
    expect(() => parseHostSteeringWheels('{"car":{"distance":3}}')).toThrow(/between -0.08/)
    expect(() => parseHostSteeringWheels('{"car":5}')).toThrow(/distance, height/)
  })

  it('lets the URL win over the build value; an empty wheel= clears it', () => {
    const fallback = { '/x.glb': { distance: 0.01, height: 0 } }
    expect(hostSteeringWheelsFromSearch('', fallback)).toEqual(fallback)
    expect(hostSteeringWheelsFromSearch('?wheel=', fallback)).toEqual({})
    expect(
      hostSteeringWheelsFromSearch('?wheel=' + encodeURIComponent('{"car":{"height":0.02}}')),
    ).toEqual({ '/library/cars/a3/s3.steering.glb': { distance: 0, height: 0.02 } })
  })
})

describe('«Volante» menu text', () => {
  it('shows centimetres with a decimal comma and the metres to bake', () => {
    expect(WHEEL_RANGE_CM).toEqual({ min: -8, max: 8, step: 0.5 })
    expect(formatWheelCm(0.015)).toBe('+1,5 cm')
    expect(formatWheelCm(-0.08)).toBe('−8,0 cm')
    expect(formatWheelCm(0)).toBe('0,0 cm')
    expect(describeWheel({ distance: 0.015, height: -0.005 })).toBe(
      'distancia +1,5 cm · altura −0,5 cm',
    )
    expect(wheelBakeValues({ distance: 0.015, height: -0.005 })).toBe(
      '{"distance":0.015,"height":-0.005}',
    )
  })
})
