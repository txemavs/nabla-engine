import { describe, it, expect } from 'vitest'
import {
  WALK_GRAVITY,
  ROCKET_ESCAPE_S,
  ROCKET_HOVER,
  ROCKET_ESCAPE_THRUST,
  rocketBurnStep,
  rocketThrust,
  rocketGravity,
  rocketAccel,
  walkGrounded,
  approachVelocity,
  walkChaseCamera,
} from './walkBody.js'

describe('walkBody', () => {
  describe('rocketBurnStep', () => {
    it('increases burn when held', () => {
      const burn = rocketBurnStep(true, 0, 0.5)
      expect(burn).toBeCloseTo(0.5)
    })

    it('caps burn at ROCKET_ESCAPE_S', () => {
      const burn = rocketBurnStep(true, ROCKET_ESCAPE_S - 0.1, 1)
      expect(burn).toBe(ROCKET_ESCAPE_S)
    })

    it('decreases burn when released', () => {
      const burn = rocketBurnStep(false, 5, 1)
      expect(burn).toBeLessThan(5)
      expect(burn).toBeGreaterThan(0)
    })

    it('burn reaches zero after enough time released', () => {
      let burn = 5
      for (let i = 0; i < 20; i++) {
        burn = rocketBurnStep(false, burn, 0.5)
      }
      expect(burn).toBe(0)
    })
  })

  describe('rocketThrust', () => {
    it('returns hover thrust at burn=0', () => {
      expect(rocketThrust(0)).toBe(ROCKET_HOVER)
    })

    it('returns escape thrust at max burn', () => {
      expect(rocketThrust(ROCKET_ESCAPE_S)).toBe(ROCKET_ESCAPE_THRUST)
    })

    it('increases quadratically with burn', () => {
      const half = rocketThrust(ROCKET_ESCAPE_S / 2)
      const quarter = (ROCKET_ESCAPE_THRUST - ROCKET_HOVER) * 0.25
      expect(half).toBeCloseTo(ROCKET_HOVER + quarter, 0)
    })
  })

  describe('rocketGravity', () => {
    it('returns full gravity at burn=0', () => {
      expect(rocketGravity(0, 0)).toBe(WALK_GRAVITY)
    })

    it('returns zero at escape burn', () => {
      expect(rocketGravity(0, ROCKET_ESCAPE_S)).toBe(0)
    })

    it('fades gravity as burn increases', () => {
      const g1 = rocketGravity(0, 5)
      const g2 = rocketGravity(0, 10)
      expect(g1).toBeLessThan(WALK_GRAVITY)
      expect(g2).toBeLessThan(g1)
    })
  })

  describe('rocketAccel', () => {
    it('returns positive (falling) when not held and no burn', () => {
      const accel = rocketAccel(false, 0, 0)
      expect(accel).toBe(WALK_GRAVITY)
    })

    it('returns negative (rising) when held with sufficient burn', () => {
      const accel = rocketAccel(true, 0, 5)
      expect(accel).toBeLessThan(0)
    })

    it('hovers at low burn when held', () => {
      const accel = rocketAccel(true, 0, 0)
      expect(accel).toBeLessThan(0)
    })
  })

  describe('walkGrounded', () => {
    it('returns true when on floor', () => {
      expect(walkGrounded(0, 0)).toBe(true)
    })

    it('returns true within slack', () => {
      expect(walkGrounded(0.01, 0)).toBe(true)
    })

    it('returns false when above floor', () => {
      expect(walkGrounded(1, 0)).toBe(false)
    })
  })

  describe('approachVelocity', () => {
    it('accelerates toward target', () => {
      const v = approachVelocity(0, 5, 10, 10, 0.1)
      expect(v).toBeCloseTo(1)
    })

    it('decelerates when target is zero', () => {
      const v = approachVelocity(5, 0, 10, 10, 0.1)
      expect(v).toBeCloseTo(4)
    })

    it('reaches target when close enough', () => {
      const v = approachVelocity(4.95, 5, 10, 10, 0.1)
      expect(v).toBe(5)
    })
  })

  describe('walkChaseCamera', () => {
    it('positions camera behind and above at yaw=0', () => {
      // At yaw=0, forward is -Z, so "behind" is +Z
      const eye = { x: 0, y: 1.7, z: 0, rx: 0, ry: 0 }
      const chase = walkChaseCamera(eye)
      expect(chase.z).toBeGreaterThan(eye.z) // camera at +Z (behind)
      expect(chase.y).toBeGreaterThan(eye.y) // camera lifted
      expect(chase.x).toBeCloseTo(eye.x) // no X offset at yaw=0
    })

    it('positions camera behind at yaw=90 (looking left, -X)', () => {
      // At yaw=90 (turned left), forward is -X, so "behind" is +X
      const eye = { x: 0, y: 1.7, z: 0, rx: 0, ry: 90 }
      const chase = walkChaseCamera(eye)
      expect(chase.x).toBeGreaterThan(eye.x) // camera at +X (behind)
      expect(chase.z).toBeCloseTo(eye.z) // no Z offset
    })

    it('maintains look direction', () => {
      const eye = { x: 0, y: 1.7, z: 0, rx: 10, ry: 45 }
      const chase = walkChaseCamera(eye)
      expect(chase.rx).toBe(eye.rx)
      expect(chase.ry).toBe(eye.ry)
    })
  })
})
