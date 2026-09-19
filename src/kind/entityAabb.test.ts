import { describe, it, expect } from 'vitest'
import {
  type Aabb3,
  isEntityFace,
  aabbFaceCorners,
  aabbFaceCenter,
  aabbFaceInYaw,
  rayHitsAabb,
  invertAffine,
  ENTITY_FACES,
} from './entityAabb.js'

describe('entityAabb', () => {
  const unitBox: Aabb3 = {
    min: [-1, -1, -1],
    max: [1, 1, 1],
  }

  describe('isEntityFace', () => {
    it('accepts valid faces', () => {
      expect(isEntityFace('+x')).toBe(true)
      expect(isEntityFace('-x')).toBe(true)
      expect(isEntityFace('+y')).toBe(true)
      expect(isEntityFace('-y')).toBe(true)
      expect(isEntityFace('+z')).toBe(true)
      expect(isEntityFace('-z')).toBe(true)
    })

    it('rejects invalid faces', () => {
      expect(isEntityFace('x')).toBe(false)
      expect(isEntityFace('top')).toBe(false)
      expect(isEntityFace(null)).toBe(false)
      expect(isEntityFace(123)).toBe(false)
    })
  })

  describe('ENTITY_FACES', () => {
    it('has all 6 faces', () => {
      expect(ENTITY_FACES).toHaveLength(6)
      expect(ENTITY_FACES).toContain('+x')
      expect(ENTITY_FACES).toContain('-x')
      expect(ENTITY_FACES).toContain('+y')
      expect(ENTITY_FACES).toContain('-y')
      expect(ENTITY_FACES).toContain('+z')
      expect(ENTITY_FACES).toContain('-z')
    })
  })

  describe('aabbFaceCorners', () => {
    it('returns 4 corners for each face', () => {
      for (const face of ENTITY_FACES) {
        const corners = aabbFaceCorners(unitBox, face)
        expect(corners).toHaveLength(4)
        for (const corner of corners) {
          expect(corner).toHaveLength(3)
        }
      }
    })

    it('+x face corners are at x=1', () => {
      const corners = aabbFaceCorners(unitBox, '+x')
      for (const [x] of corners) {
        expect(x).toBe(1)
      }
    })

    it('-x face corners are at x=-1', () => {
      const corners = aabbFaceCorners(unitBox, '-x')
      for (const [x] of corners) {
        expect(x).toBe(-1)
      }
    })
  })

  describe('aabbFaceCenter', () => {
    it('+x face center is at x=1', () => {
      const center = aabbFaceCenter(unitBox, '+x')
      expect(center.x).toBe(1)
      expect(center.y).toBe(0)
      expect(center.z).toBe(0)
    })

    it('-y face center is at y=-1', () => {
      const center = aabbFaceCenter(unitBox, '-y')
      expect(center.x).toBe(0)
      expect(center.y).toBe(-1)
      expect(center.z).toBe(0)
    })
  })

  describe('aabbFaceInYaw', () => {
    it('+z returns PI (180 deg)', () => {
      expect(aabbFaceInYaw('+z')).toBeCloseTo(Math.PI)
    })

    it('-z returns 0', () => {
      expect(aabbFaceInYaw('-z')).toBe(0)
    })

    it('+x returns -PI/2', () => {
      expect(aabbFaceInYaw('+x')).toBeCloseTo(-Math.PI / 2)
    })

    it('-x returns PI/2', () => {
      expect(aabbFaceInYaw('-x')).toBeCloseTo(Math.PI / 2)
    })
  })

  describe('rayHitsAabb', () => {
    it('ray pointing at box hits', () => {
      const o: [number, number, number] = [0, 0, -5]
      const d: [number, number, number] = [0, 0, 1]
      const t = rayHitsAabb(o, d, unitBox)

      expect(t).not.toBeNull()
      expect(t).toBeCloseTo(4)
    })

    it('ray pointing away misses', () => {
      const o: [number, number, number] = [0, 0, -5]
      const d: [number, number, number] = [0, 0, -1]
      const t = rayHitsAabb(o, d, unitBox)

      expect(t).toBeNull()
    })

    it('ray from inside returns 0', () => {
      const o: [number, number, number] = [0, 0, 0]
      const d: [number, number, number] = [0, 0, 1]
      const t = rayHitsAabb(o, d, unitBox)

      expect(t).toBe(0)
    })

    it('ray missing box returns null', () => {
      const o: [number, number, number] = [10, 10, -5]
      const d: [number, number, number] = [0, 0, 1]
      const t = rayHitsAabb(o, d, unitBox)

      expect(t).toBeNull()
    })
  })

  describe('invertAffine', () => {
    it('inverts identity matrix', () => {
      const I = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ])
      const inv = invertAffine(I)

      expect(inv).not.toBeNull()
      for (let i = 0; i < 16; i++) {
        expect(inv![i]).toBeCloseTo(I[i])
      }
    })

    it('inverts translation matrix', () => {
      const T = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        5, 10, 15, 1,
      ])
      const inv = invertAffine(T)

      expect(inv).not.toBeNull()
      expect(inv![12]).toBeCloseTo(-5)
      expect(inv![13]).toBeCloseTo(-10)
      expect(inv![14]).toBeCloseTo(-15)
    })

    it('returns null for singular matrix', () => {
      const singular = new Float32Array([
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ])
      expect(invertAffine(singular)).toBeNull()
    })
  })
})
