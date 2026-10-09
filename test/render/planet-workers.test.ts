import { describe, expect, it } from 'vitest'
import { planetWorkerCount } from '../../src/render/planet/world.js'

describe('planet cell workers', () => {
  it('uses half the cores, between 1 and 4', () => {
    expect(planetWorkerCount(1)).toBe(1)
    expect(planetWorkerCount(2)).toBe(1)
    expect(planetWorkerCount(6)).toBe(3)
    expect(planetWorkerCount(32)).toBe(4)
    expect(planetWorkerCount(0)).toBe(2)
  })
})
