import { describe, expect, it } from 'vitest'
import { playModeFromSearch, scopedKey } from '../src/runtime/settings-scope.js'

describe('settings scope', () => {
  it('reads the play mode from ?vr=', () => {
    expect(playModeFromSearch('')).toBe('pc')
    expect(playModeFromSearch('?vr=pc')).toBe('headset-pc')
    expect(playModeFromSearch('?vr=headset')).toBe('headset')
    expect(playModeFromSearch('?vr=x')).toBe('pc')
  })
  it('keeps PC keys and namespaces VR modes', () => {
    expect(scopedKey('pc', 'nabla.quality')).toBe('nabla.quality')
    expect(scopedKey('headset', 'nabla.quality')).toBe('nabla.settings.headset.quality')
    expect(scopedKey('headset-pc', 'nabla.layers')).toBe('nabla.settings.headset-pc.layers')
    expect(scopedKey('headset', 'other')).toBe('other')
  })
})
