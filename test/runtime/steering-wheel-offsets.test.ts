import { describe, expect, it } from 'vitest'
import {
  defaultSteeringWheelOffset,
  describeSteeringWheelOffset,
  formatSteeringWheelCm,
  initialSteeringWheelOffset,
  readSteeringWheelOffset,
  steeringWheelStorageKey,
  writeSteeringWheelOffset,
} from '../../src/runtime/steering-wheel-offsets.js'

const memory = () => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}
const s3 = '/library/cars/a3/s3.steering.glb'

describe('steering wheel settings', () => {
  it('prefers the saved choice, then the host default, then the GLB pose', () => {
    const storage = memory()
    const settings = { defaults: { [s3]: { distance: 0.02 } }, storage }
    expect(initialSteeringWheelOffset(settings, s3)).toEqual({ distance: 0.02, height: 0 })
    expect(initialSteeringWheelOffset(settings, '/other.glb')).toEqual({ distance: 0, height: 0 })
    writeSteeringWheelOffset(storage, s3, { distance: -0.015, height: 0.005 })
    expect(storage.data.get(steeringWheelStorageKey(s3))).toBe('{"distance":-0.015,"height":0.005}')
    expect(initialSteeringWheelOffset(settings, s3)).toEqual({ distance: -0.015, height: 0.005 })
    writeSteeringWheelOffset(storage, s3, undefined)
    expect(readSteeringWheelOffset(storage, s3)).toBeUndefined()
    expect(defaultSteeringWheelOffset(settings, s3)).toEqual({ distance: 0.02, height: 0 })
  })

  it('ignores unreadable or out-of-range stored values and failing storage', () => {
    const storage = memory()
    storage.setItem(steeringWheelStorageKey(s3), 'not json')
    expect(readSteeringWheelOffset(storage, s3)).toBeUndefined()
    storage.setItem(steeringWheelStorageKey(s3), '{"distance":1,"height":"x"}')
    expect(readSteeringWheelOffset(storage, s3)).toEqual({ distance: 0.08, height: 0 })
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => undefined,
    }
    expect(readSteeringWheelOffset(broken, s3)).toBeUndefined()
    expect(() => writeSteeringWheelOffset(broken, s3, { distance: 0, height: 0 })).not.toThrow()
    expect(initialSteeringWheelOffset({ storage: null }, s3)).toEqual({ distance: 0, height: 0 })
  })

  it('logs centimetres and the metres to bake', () => {
    expect(formatSteeringWheelCm(0.015)).toBe('+1.5 cm')
    expect(formatSteeringWheelCm(-0.005)).toBe('-0.5 cm')
    expect(formatSteeringWheelCm(0)).toBe('0.0 cm')
    expect(describeSteeringWheelOffset({ distance: 0.015, height: -0.005 })).toBe(
      'distance +1.5 cm, height -0.5 cm {"distance":0.015,"height":-0.005}',
    )
  })
})
