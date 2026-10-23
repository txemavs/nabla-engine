import { describe, expect, it } from 'vitest'
import { readBootConfig } from '../../game/boot.js'
import { resolveSimulatedFireEnabled } from '../../game/simulated-fire-ui.js'

const store = (v: string | null) => ({ getItem: () => v, setItem: () => {} })

describe('simulated fire option', () => {
  it('defaults on and honours storage over the boot config', () => {
    expect(resolveSimulatedFireEnabled(undefined, store(null))).toBe(true)
    expect(resolveSimulatedFireEnabled(false, store(null))).toBe(false)
    expect(resolveSimulatedFireEnabled(true, store('0'))).toBe(false)
    expect(resolveSimulatedFireEnabled(false, store('1'))).toBe(true)
  })
  it('ignores a ?simFire URL parameter (config lives in code)', () => {
    expect(readBootConfig('?simFire=0', {}).simulatedFire).toBeUndefined()
    expect(readBootConfig('', { NABLA_BOOT: { simulatedFire: false } } as never).simulatedFire).toBe(false)
  })
})
