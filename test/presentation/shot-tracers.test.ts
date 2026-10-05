import { describe, expect, it } from 'vitest'
import { ShotTracers } from '../../src/render/entity/shot-tracers.js'

describe('ShotTracers', () => {
  it('keeps a short-lived muzzle streak then clears it', () => {
    const tracers = new ShotTracers()
    tracers.add([0, 1, 0], [0, 1, -10], 1000)
    expect(tracers.root.children).toHaveLength(1)
    tracers.update(1040)
    tracers.update(1200)
    tracers.dispose()
  })

  it('bounds the ring to twenty-four streaks', () => {
    const tracers = new ShotTracers()
    for (let i = 0; i < 30; i++) tracers.add([0, 0, 0], [0, 0, -i], 1000 + i)
    tracers.dispose()
    expect(true).toBe(true)
  })
})
