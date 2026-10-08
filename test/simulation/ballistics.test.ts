/**
 * The USP Compact's ballistics: the drag constant fitted to Federal's published velocity table
 * for AE9AP, the zeroed trajectory, and one bullet through a world ray query.
 */
import { describe, expect, it } from 'vitest'
import { weaponPreset } from '../../src/catalog/weapons/library.js'
import {
  bulletEnergy,
  fitDrag,
  flightProfile,
  speedAt,
  traceBullet,
  units,
  zeroAngle,
  type BallisticLoad,
} from '../../src/simulation/weapons/ballistics.js'

const load = (): BallisticLoad => weaponPreset('hk-compact').ammunition!

describe('9x19 ballistics', () => {
  it('fits Federal AE9AP within 2% at every published range', () => {
    const ammo = load()
    expect(ammo.muzzleVelocityMs).toBeCloseTo(1150 * units.foot, 1)
    const k = fitDrag(ammo.velocityTable)
    expect(k).toBeGreaterThan(0)
    for (const point of ammo.velocityTable) {
      const published = point.fps * units.foot
      const fitted = speedAt(ammo, point.yards * units.yard, k)
      expect(Math.abs(fitted - published) / published).toBeLessThan(0.02)
    }
  })

  it('a 25 yard zero stays under a hand width high and drops past it', () => {
    const ammo = load()
    const angle = zeroAngle(ammo)
    expect(angle).toBeGreaterThan(0)
    expect(angle).toBeLessThan(0.01)
    const profile = flightProfile(ammo, angle, 100, 1)
    const at = (x: number) =>
      profile.reduce((best, s) => (Math.abs(s.x - x) < Math.abs(best.x - x) ? s : best))
    // Back through the sight line at the zero range.
    expect(Math.abs(at(ammo.zeroRangeM).y)).toBeLessThan(0.005)
    // The mid-range hump of a 25 yd zero is small.
    const hump = Math.max(...profile.filter((s) => s.x <= ammo.zeroRangeM).map((s) => s.y))
    expect(hump).toBeLessThan(0.05)
    // Gravity wins past the zero: below the line of sight, and falling fast with range.
    expect(at(50).y).toBeLessThan(0)
    expect(at(100).y).toBeLessThan(at(50).y - 0.2)
    // Still moving, and slower than at the muzzle.
    expect(at(50).speed).toBeGreaterThan(250)
    expect(at(50).speed).toBeLessThan(ammo.muzzleVelocityMs)
  })

  it('hands the bullet its momentum at the impact and drops past a short wall', () => {
    const ammo = load()
    const ground = traceBullet(ammo, [0, 1.6, 0], [0, 0, -1], (from, direction, length) => {
      if (direction[1] >= 0) return null
      const distance = -from[1] / direction[1]
      if (distance > length) return null
      return {
        point: [from[0] + direction[0] * distance, 0, from[2] + direction[2] * distance],
        normal: [0, 1, 0],
        entityId: null,
      }
    })
    expect(ground.hit).toBeTruthy()
    expect(ground.hit!.point[1]).toBe(0)
    // A 9 mm zeroed at 25 yd from eye height lands far downrange, not at the shooter's feet.
    expect(ground.hit!.distance).toBeGreaterThan(80)
    expect(ground.hit!.distance).toBeLessThan(300)
    const energy = bulletEnergy(ammo, ground.hit!.speed)
    expect(energy.joules).toBeLessThan(0.5 * ammo.bulletMassKg * ammo.muzzleVelocityMs ** 2)
    expect(energy.momentum).toBeGreaterThan(1)
    // A wall 1 m away stops it there, with nearly all its muzzle energy.
    const wall = traceBullet(ammo, [0, 1.6, 0], [0, 0, -1], () => ({
      point: [0, 1.6, -1],
      normal: [0, 0, 1],
      entityId: 'wall',
    }))
    expect(wall.hit!.entityId).toBe('wall')
    expect(wall.hit!.distance).toBeLessThan(2)
    expect(bulletEnergy(ammo, wall.hit!.speed).joules).toBeGreaterThan(450)
  })
})
