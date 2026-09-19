import { describe, it, expect } from 'vitest'
import {
  entityYawDeg,
  altitudeY,
  metresToCssMm,
  MM_PER_M,
  PX_PER_MM,
  entityTransform,
  IDENTITY_ENTITY,
} from './world.js'

describe('world', () => {
  describe('entityYawDeg', () => {
    it('converts radians to degrees', () => {
      expect(entityYawDeg(Math.PI)).toBeCloseTo(180)
      expect(entityYawDeg(Math.PI / 2)).toBeCloseTo(90)
      expect(entityYawDeg(-Math.PI / 2)).toBeCloseTo(-90)
    })

    it('passes through degrees unchanged', () => {
      expect(entityYawDeg(90)).toBe(90)
      expect(entityYawDeg(180)).toBe(180)
      expect(entityYawDeg(-45)).toBe(-45)
    })

    it('handles zero', () => {
      expect(entityYawDeg(0)).toBe(0)
    })

    it('handles NaN', () => {
      expect(entityYawDeg(NaN)).toBe(0)
    })

    it('handles Infinity', () => {
      expect(entityYawDeg(Infinity)).toBe(0)
    })
  })

  describe('altitudeY', () => {
    it('converts mm height to CSS Y (negative)', () => {
      expect(altitudeY(1000)).toBe(-1000)
      expect(altitudeY(0)).toBe(-0) // -0 * 1 = -0
      expect(altitudeY(500)).toBe(-500)
    })
  })

  describe('metresToCssMm', () => {
    it('converts metres to mm with Y flip', () => {
      const result = metresToCssMm({ x: 1, y: 2, z: 3 })
      expect(result.x).toBe(1000)
      expect(result.y).toBe(-2000)
      expect(result.z).toBe(3000)
    })
  })

  describe('constants', () => {
    it('has correct MM_PER_M', () => {
      expect(MM_PER_M).toBe(1000)
    })

    it('has correct PX_PER_MM', () => {
      expect(PX_PER_MM).toBe(1)
    })
  })

  describe('entityTransform', () => {
    it('generates identity transform', () => {
      const transform = entityTransform(IDENTITY_ENTITY)
      expect(transform).toContain('translate3d(0px, 0px, 0px)')
      expect(transform).toContain('rotateX(0deg)')
      expect(transform).toContain('rotateY(0deg)')
      expect(transform).toContain('rotateZ(0deg)')
      expect(transform).toContain('scale3d(1, 1, 1)')
    })

    it('generates transform with values', () => {
      const transform = entityTransform({
        x: 10, y: 20, z: 30,
        rx: 45, ry: 90, rz: 180,
        sx: 2, sy: 3, sz: 4,
      })
      expect(transform).toContain('translate3d(10px, 20px, 30px)')
      expect(transform).toContain('rotateX(45deg)')
      expect(transform).toContain('rotateY(90deg)')
      expect(transform).toContain('rotateZ(180deg)')
      expect(transform).toContain('scale3d(2, 3, 4)')
    })
  })
})
