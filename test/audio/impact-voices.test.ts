import { expect, it } from 'vitest'
import { ImpactVoicePool, impactVoiceLimit } from '../../src/audio/impact-voices.js'

it('caps impact voices at the pool size and reuses the oldest', () => {
  expect(impactVoiceLimit).toBeLessThanOrEqual(8)
  const pool = new ImpactVoicePool<string>()
  const used = new Set<number>()
  for (let i = 0; i < 100; i++) {
    const voice = pool.take(`surface-${i}`, i * 0.001, 0.04)
    expect(voice).not.toBeNull()
    used.add(voice!)
  }
  expect(used.size).toBe(impactVoiceLimit)
  expect(Math.max(...used)).toBe(impactVoiceLimit - 1)
})

it('drops a hit of the same surface inside its cooldown', () => {
  const pool = new ImpactVoicePool<string>(8)
  expect(pool.take('metal-sign', 0, 0.06)).toBe(0)
  expect(pool.take('metal-sign', 0.03, 0.06)).toBeNull()
  // Another surface has its own cooldown.
  expect(pool.take('metal-body', 0.03, 0.04)).toBe(1)
  expect(pool.take('metal-sign', 0.07, 0.06)).toBe(2)
})
