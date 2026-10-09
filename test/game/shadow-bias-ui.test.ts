import { describe, expect, it } from 'vitest'
import {
  SHADOW_BIAS_STORAGE_KEY,
  hostShadowBias,
  resolveShadowBias,
  saveShadowBias,
  resolveShadowsEnabled,
} from '../../game/shadow-bias-ui.js'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

describe('shadow bias setting', () => {
  it('shares shadow state with the light panel and migrates the legacy preference', () => {
    expect(resolveShadowsEnabled(memoryStorage({ 'nabla.shadowsEnabled': '0' }))).toBe(false)
    expect(
      resolveShadowsEnabled(
        memoryStorage({
          'nabla.shadowsEnabled': '0',
          'nabla.lightTuning': JSON.stringify({ shadows: true }),
        }),
      ),
    ).toBe(true)
  })
  it('defaults to the tuned factor and clamps host values', () => {
    expect(resolveShadowBias(undefined, memoryStorage())).toBe(1)
    expect(hostShadowBias(undefined)).toBe(1)
    expect(hostShadowBias(9)).toBe(3)
    expect(hostShadowBias(-1)).toBe(0)
  })

  it('lets the saved player choice win over the host default', () => {
    const storage = memoryStorage({ [SHADOW_BIAS_STORAGE_KEY]: '0.25' })
    expect(resolveShadowBias(2, storage)).toBe(0.25)
    expect(resolveShadowBias(2, memoryStorage({ [SHADOW_BIAS_STORAGE_KEY]: 'junk' }))).toBe(2)
  })

  it('saves a clamped factor and forgets it on reset', () => {
    const storage = memoryStorage()
    saveShadowBias(5, storage)
    expect(storage.getItem(SHADOW_BIAS_STORAGE_KEY)).toBe('3')
    saveShadowBias(null, storage)
    expect(storage.getItem(SHADOW_BIAS_STORAGE_KEY)).toBeNull()
    expect(resolveShadowBias(1.5, storage)).toBe(1.5)
  })
})
