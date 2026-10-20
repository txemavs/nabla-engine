import { describe, expect, it } from 'vitest'
import { SPARK_PROFILES, ShotSparks, sparkPosition } from '../../src/render/entity/shot-sparks.js'
import { muzzleFlashGeometry, shapeMuzzleFlash } from '../../src/render/entity/muzzle-flash.js'
import * as THREE from 'three'
import { ShotLaser } from '../../src/render/entity/shot-laser.js'

describe('ShotSparks', () => {
  it('spawns a short-lived burst then clears it', () => {
    const sparks = new ShotSparks()
    sparks.add([0, 1, 0], 1000, [0, 1, 0], { surface: 'metal' })
    // Streaks and the dust/flash points: one draw each.
    expect(sparks.root.children).toHaveLength(2)
    sparks.update(1050)
    expect(sparks.root.children.every((child) => child.visible)).toBe(true)
    sparks.update(2000)
    expect(sparks.root.children.some((child) => child.visible)).toBe(false)
    sparks.dispose()
  })

  it('caps concurrent bursts', () => {
    const sparks = new ShotSparks()
    for (let i = 0; i < 20; i++) sparks.add([0, 0, i], 1000 + i)
    sparks.update(1010)
    sparks.dispose()
  })
})

describe('spark surfaces and motion', () => {
  it('sparks most on metal, least on ground; dust the other way round', () => {
    const count = (surface: 'metal' | 'concrete' | 'ground') => {
      const sparks = new ShotSparks()
      sparks.add([0, 1, 0], 1000, [0, 0, 1], { surface })
      const n = sparks.livePositions(1050).length / 3
      sparks.dispose()
      return n
    }
    expect(count('metal')).toBe(SPARK_PROFILES.metal.sparks)
    expect(count('metal')).toBeGreaterThan(count('concrete'))
    expect(count('concrete')).toBeGreaterThan(count('ground'))
    expect(SPARK_PROFILES.ground.dust).toBeGreaterThan(SPARK_PROFILES.metal.dust)
  })

  it('bounces off the ground plane and never sinks below it', () => {
    const p0 = [0, 1, 0],
      v0 = [2, 1, 0],
      drift = [0, 0, 0]
    for (let t = 0; t < 1.5; t += 0.01)
      expect(sparkPosition(p0, v0, drift, 1, t)[1]).toBeGreaterThanOrEqual(1 - 1e-9)
    // Without a ground plane it falls freely; drag slows the horizontal travel.
    const free = sparkPosition(p0, v0, drift, -1e9, 1)
    expect(free[1]).toBeLessThan(0)
    expect(free[0]).toBeLessThan(2)
  })
})

describe('muzzle flash', () => {
  it('is a star (alternating rim radii) that varies per shot but not per frame', () => {
    const geometry = muzzleFlashGeometry()
    const position = geometry.getAttribute('position')
    const radii = new Set<number>()
    for (let i = 0; i < position.count; i++) {
      const r = Math.hypot(position.getX(i), position.getZ(i))
      if (r > 1e-6) radii.add(Math.round(r * 1e4))
    }
    expect(radii.size).toBe(2)
    const flash = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true }))
    shapeMuzzleFlash(flash, 1000, 10, 0.55)
    const a = flash.scale.clone()
    shapeMuzzleFlash(flash, 1000, 20, 0.55)
    expect(flash.scale.equals(a)).toBe(true)
    shapeMuzzleFlash(flash, 1100, 20, 0.55)
    expect(flash.scale.equals(a)).toBe(false)
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
