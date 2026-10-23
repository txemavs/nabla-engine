import { describe, expect, it } from 'vitest'
import { readBootConfig } from '../../game/boot.js'
import { resolveSimulatedFireEnabled } from '../../game/simulated-fire-ui.js'

const store = (v: string | null) => ({ getItem: () => v, setItem: () => {} })

describe('simulated fire option', () => {
  it('defaults on and honours storage, boot and URL (URL wins)', () => {
    expect(resolveSimulatedFireEnabled(undefined, store(null), '')).toBe(true)
    expect(resolveSimulatedFireEnabled(false, store(null), '')).toBe(false)
    expect(resolveSimulatedFireEnabled(true, store('0'), '')).toBe(false)
    expect(resolveSimulatedFireEnabled(false, store('0'), '?simFire=1')).toBe(true)
    expect(resolveSimulatedFireEnabled(true, store('1'), '?simFire=0')).toBe(false)
  })
  it('reads ?simFire into the boot config', () => {
    expect(readBootConfig('?simFire=0', {}).simulatedFire).toBe(false)
    expect(readBootConfig('?simFire=1', {}).simulatedFire).toBe(true)
    expect(readBootConfig('', {}).simulatedFire).toBeUndefined()
  })
})
