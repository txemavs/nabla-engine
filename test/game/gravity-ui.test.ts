import { describe, expect, it } from 'vitest'
import { GRAVITY_SCALE_STORAGE_KEY, resolveGravityScale } from '../../game/gravity-ui.js'

const store = (value: string | null) => ({
  getItem: (key: string) => (key === GRAVITY_SCALE_STORAGE_KEY ? value : null),
  setItem: () => {},
})

describe('resolveGravityScale', () => {
  it('defaults to 1× when nothing is stored', () =>
    expect(resolveGravityScale(store(null))).toBe(1))
  it('keeps a stored value inside 0.5–3', () => expect(resolveGravityScale(store('1.5'))).toBe(1.5))
  it('drops out-of-range or malformed values', () => {
    expect(resolveGravityScale(store('5'))).toBe(1)
    expect(resolveGravityScale(store('abc'))).toBe(1)
  })
})
