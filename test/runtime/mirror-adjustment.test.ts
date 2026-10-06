import { describe, expect, it } from 'vitest'
import {
  defaultMirrorAdjustment,
  describeMirrorAdjustment,
  formatMirrorDegrees,
  initialMirrorAdjustment,
  mirrorStorageKey,
  readMirrorAdjustment,
  writeMirrorAdjustment,
} from '../../src/runtime/mirror-adjustment.js'

const memory = () => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}
const truck = '/library/trucks/white-truck/assets/tractor.modern.glb'

describe('mirror settings', () => {
  it('prefers the saved choice, then the host default, then the authored aim', () => {
    const storage = memory()
    const settings = { defaults: { [truck]: { left: { yaw: -2 } } }, storage }
    expect(initialMirrorAdjustment(settings, truck)).toEqual({ left: { yaw: -2, tilt: 0 } })
    expect(initialMirrorAdjustment(settings, '/other.glb')).toEqual({})
    writeMirrorAdjustment(storage, truck, { right: { yaw: -1.5, tilt: 0.5 } })
    expect(storage.data.get(mirrorStorageKey(truck))).toBe('{"right":{"yaw":-1.5,"tilt":0.5}}')
    expect(initialMirrorAdjustment(settings, truck)).toEqual({ right: { yaw: -1.5, tilt: 0.5 } })
    writeMirrorAdjustment(storage, truck, undefined)
    expect(storage.data.has(mirrorStorageKey(truck))).toBe(false)
    expect(defaultMirrorAdjustment(settings, truck)).toEqual({ left: { yaw: -2, tilt: 0 } })
  })

  it('ignores unreadable stored values and a refusing storage', () => {
    const storage = memory()
    storage.data.set(mirrorStorageKey(truck), '[1,2]')
    expect(readMirrorAdjustment(storage, truck)).toBeUndefined()
    storage.data.set(mirrorStorageKey(truck), '{bad')
    expect(readMirrorAdjustment(storage, truck)).toBeUndefined()
    const refusing = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {},
    }
    expect(readMirrorAdjustment(refusing, truck)).toBeUndefined()
    expect(() => writeMirrorAdjustment(refusing, truck, {})).not.toThrow()
  })

  it('logs degrees per side with the JSON to bake', () => {
    expect(formatMirrorDegrees(1.5)).toBe('+1.5°')
    expect(formatMirrorDegrees(-0)).toBe('0.0°')
    expect(describeMirrorAdjustment({ left: { yaw: -2, tilt: 1 } }, ['left', 'right'])).toBe(
      'left yaw -2.0° tilt +1.0°, right yaw 0.0° tilt 0.0° {"left":{"yaw":-2,"tilt":1}}',
    )
  })
})
