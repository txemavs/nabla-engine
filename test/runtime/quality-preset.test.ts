import { describe, expect, it } from 'vitest'
import {
  QUALITY_STORAGE_KEY,
  QUALITY_SESSION_STORAGE_KEY,
  readQualityPreset,
  takeAutoEnter,
  saveQualityPreset,
} from '../../src/runtime/quality-preset.js'

function memory() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('quality preset', () => {
  it('uses the URL, then the saved profile, then the fallback', () => {
    const s = memory()
    expect(readQualityPreset('', s)).toBe('custom')
    saveQualityPreset('low', s)
    expect(readQualityPreset('', s)).toBe('low')
    // A host that strips ?quality= still boots the saved profile.
    expect(readQualityPreset('?renderer=webgl', s)).toBe('low')
    expect(readQualityPreset('?quality=high', s)).toBe('high')
    saveQualityPreset('custom', s)
    expect(s.map.has(QUALITY_STORAGE_KEY)).toBe(false)
  })

  it('ignores garbage in storage', () => {
    const s = memory()
    s.setItem(QUALITY_STORAGE_KEY, '<script>')
    expect(readQualityPreset('', s)).toBe('custom')
  })

  it('the tab override beats the saved profile and never changes it', () => {
    const s = memory(),
      session = memory()
    saveQualityPreset('high', s)
    session.setItem(QUALITY_SESSION_STORAGE_KEY, 'mobile')
    expect(readQualityPreset('', s, 'custom', session)).toBe('mobile')
    expect(readQualityPreset('?quality=low', s, 'custom', session)).toBe('low')
    expect(s.getItem(QUALITY_STORAGE_KEY)).toBe('high')
  })

  it('auto-enter is one-shot', () => {
    const session = memory()
    session.setItem('nabla.autoEnter', '1')
    expect(takeAutoEnter(session)).toBe(true)
    expect(takeAutoEnter(session)).toBe(false)
  })
})
