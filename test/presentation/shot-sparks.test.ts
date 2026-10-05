import { describe, expect, it } from 'vitest'
import { ShotSparks } from '../../src/render/entity/shot-sparks.js'
import { ShotLaser } from '../../src/render/entity/shot-laser.js'

describe('ShotSparks', () => {
  it('spawns a short-lived burst then clears it', () => {
    const sparks = new ShotSparks()
    sparks.add([0, 1, 0], 1000, [0, 1, 0])
    expect(sparks.root.children).toHaveLength(1)
    sparks.update(1050)
    sparks.update(1300)
    sparks.dispose()
  })

  it('caps concurrent bursts', () => {
    const sparks = new ShotSparks()
    for (let i = 0; i < 20; i++) sparks.add([0, 0, i], 1000 + i)
    sparks.update(1010)
    sparks.dispose()
  })
})

describe('ShotLaser', () => {
  it('shows a beam and pin only while enabled', () => {
    const laser = new ShotLaser()
    expect(laser.root.visible).toBe(false)
    laser.enabled = true
    expect(laser.root.visible).toBe(true)
    laser.set([0, 1, 0], [0, 1, -5], true)
    laser.enabled = false
    expect(laser.root.visible).toBe(false)
    laser.dispose()
  })
})
