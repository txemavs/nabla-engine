import { describe, expect, it } from 'vitest'
import {
  QUALITY_PREVIOUS_STORAGE_KEY,
  QUALITY_STORAGE_KEY,
  readQualityPreset,
  saveQualityPreset,
  toggleMobileQuality,
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

  it('toggles to mobile and back to the previous profile', () => {
    const s = memory()
    saveQualityPreset('balanced', s)
    expect(toggleMobileQuality('balanced', s)).toBe('mobile')
    expect(readQualityPreset('', s)).toBe('mobile')
    expect(toggleMobileQuality('mobile', s)).toBe('balanced')
    expect(readQualityPreset('', s)).toBe('balanced')
    expect(s.map.has(QUALITY_PREVIOUS_STORAGE_KEY)).toBe(false)
  })

  it('returns to custom when there was no previous profile', () => {
    const s = memory()
    expect(toggleMobileQuality('custom', s)).toBe('mobile')
    expect(toggleMobileQuality('mobile', s)).toBe('custom')
    expect(s.map.has(QUALITY_STORAGE_KEY)).toBe(false)
  })
})
