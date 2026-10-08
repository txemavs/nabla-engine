import { describe, expect, it } from 'vitest'
import { sidearmButtonAction } from '../../src/runtime/shooting.js'

describe('sidearm mouse buttons', () => {
  it('fires on left click even when that click is the second button down', () => {
    expect(sidearmButtonAction(0, true)).toBe('fire')
    expect(sidearmButtonAction(2, true)).toBe('aim')
    expect(sidearmButtonAction(0, false)).toBe('release')
    expect(sidearmButtonAction(2, false)).toBe('unaim')
    expect(sidearmButtonAction(1, true)).toBeNull()
  })
})
