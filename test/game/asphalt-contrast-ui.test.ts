import { describe, expect, it } from 'vitest'
import { resolveAsphaltContrast } from '../../game/asphalt-contrast-ui.js'

const storage = (value?: string) => ({
  getItem: () => value ?? null,
  setItem: () => undefined,
  removeItem: () => undefined,
})

describe('asphalt contrast start value', () => {
  it('defaults to unchanged and takes the host default', () => {
    expect(resolveAsphaltContrast(undefined, storage(), '')).toBe(1)
    expect(resolveAsphaltContrast(1.6, storage(), '')).toBe(1.6)
  })

  it('prefers the stored slider, then the URL for one visit', () => {
    expect(resolveAsphaltContrast(1.6, storage('1.2'), '')).toBe(1.2)
    expect(resolveAsphaltContrast(1.6, storage('1.2'), '?asphaltContrast=2')).toBe(2)
  })

  it('clamps and ignores invalid values', () => {
    expect(resolveAsphaltContrast(9, storage('x'), '?asphaltContrast=')).toBe(2.5)
    expect(resolveAsphaltContrast(undefined, storage('0.1'), '?asphaltContrast=abc')).toBe(0.5)
  })
})
