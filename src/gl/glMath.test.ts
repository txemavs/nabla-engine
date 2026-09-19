import { describe, it, expect } from 'vitest'
import {
  cssToGl,
  lookAt,
  perspective,
  mul4,
  invert4,
  transformPoint,
  hitTri,
  rayQuadHit,
  type Vec3,
} from './glMath.js'

describe('glMath', () => {
  describe('cssToGl', () => {
    it('flips Y axis', () => {
      expect(cssToGl([1, 2, 3])).toEqual([1, -2, 3])
    })

    it('preserves zero', () => {
      expect(cssToGl([0, 0, 0])).toEqual([0, -0, 0])
    })
  })

  describe('lookAt', () => {
    it('creates view matrix looking at origin', () => {
      const eye: Vec3 = [0, 0, 5]
      const target: Vec3 = [0, 0, 0]
      const up: Vec3 = [0, 1, 0]
      const view = lookAt(eye, target, up)

      expect(view.length).toBe(16)
      expect(view[15]).toBeCloseTo(1) // homogeneous w
    })

    it('eye at target returns valid matrix', () => {
      const eye: Vec3 = [0, 0, 0]
      const target: Vec3 = [0, 0, 0]
      const up: Vec3 = [0, 1, 0]
      const view = lookAt(eye, target, up)

      expect(view.length).toBe(16)
    })
  })

  describe('perspective', () => {
    it('creates perspective projection matrix', () => {
      const proj = perspective(60, 1.5, 0.1, 100)

      expect(proj.length).toBe(16)
      expect(proj[11]).toBeCloseTo(-1) // perspective divide
      expect(proj[15]).toBe(0) // homogeneous perspective
    })
  })

  describe('mul4', () => {
    it('multiplies identity by identity', () => {
      const I = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ])
      const result = mul4(I, I)

      for (let i = 0; i < 16; i++) {
        expect(result[i]).toBeCloseTo(I[i])
      }
    })

    it('multiplies matrix by identity', () => {
      const I = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ])
      const A = new Float32Array([
        2, 0, 0, 0,
        0, 3, 0, 0,
        0, 0, 4, 0,
        1, 2, 3, 1,
      ])
      const result = mul4(A, I)

      for (let i = 0; i < 16; i++) {
        expect(result[i]).toBeCloseTo(A[i])
      }
    })
  })

  describe('invert4', () => {
    it('inverts identity matrix', () => {
      const I = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ])
      const inv = invert4(I)

      expect(inv).not.toBeNull()
      for (let i = 0; i < 16; i++) {
        expect(inv![i]).toBeCloseTo(I[i])
      }
    })

    it('returns null for singular matrix', () => {
      const singular = new Float32Array([
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ])
      expect(invert4(singular)).toBeNull()
    })

    it('inverts translation matrix', () => {
      const T = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        5, 10, 15, 1,
      ])
      const inv = invert4(T)

      expect(inv).not.toBeNull()
      expect(inv![12]).toBeCloseTo(-5)
      expect(inv![13]).toBeCloseTo(-10)
      expect(inv![14]).toBeCloseTo(-15)
    })
  })

  describe('transformPoint', () => {
    it('transforms point by identity', () => {
      const I = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ])
      const p: Vec3 = [1, 2, 3]
      const result = transformPoint(I, p)

      expect(result[0]).toBeCloseTo(1)
      expect(result[1]).toBeCloseTo(2)
      expect(result[2]).toBeCloseTo(3)
    })

    it('transforms point by translation', () => {
      const T = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        10, 20, 30, 1,
      ])
      const p: Vec3 = [1, 2, 3]
      const result = transformPoint(T, p)

      expect(result[0]).toBeCloseTo(11)
      expect(result[1]).toBeCloseTo(22)
      expect(result[2]).toBeCloseTo(33)
    })
  })

  describe('hitTri', () => {
    it('hits triangle at center', () => {
      const o: Vec3 = [0, 0, -5]
      const d: Vec3 = [0, 0, 1]
      const v0: Vec3 = [-1, -1, 0]
      const v1: Vec3 = [1, -1, 0]
      const v2: Vec3 = [0, 1, 0]
      const t = hitTri(o, d, v0, v1, v2)

      expect(t).not.toBeNull()
      expect(t).toBeCloseTo(5)
    })

    it('misses triangle (parallel ray)', () => {
      const o: Vec3 = [0, 0, -5]
      const d: Vec3 = [1, 0, 0] // parallel to triangle
      const v0: Vec3 = [-1, -1, 0]
      const v1: Vec3 = [1, -1, 0]
      const v2: Vec3 = [0, 1, 0]
      const t = hitTri(o, d, v0, v1, v2)

      expect(t).toBeNull()
    })

    it('misses triangle (ray away)', () => {
      const o: Vec3 = [0, 0, 5]
      const d: Vec3 = [0, 0, 1] // pointing away
      const v0: Vec3 = [-1, -1, 0]
      const v1: Vec3 = [1, -1, 0]
      const v2: Vec3 = [0, 1, 0]
      const t = hitTri(o, d, v0, v1, v2)

      expect(t).toBeNull()
    })
  })

  describe('rayQuadHit', () => {
    it('hits quad at center', () => {
      const o: Vec3 = [0, 0, -5]
      const d: Vec3 = [0, 0, 1]
      const q: [Vec3, Vec3, Vec3, Vec3] = [
        [-1, -1, 0],
        [1, -1, 0],
        [1, 1, 0],
        [-1, 1, 0],
      ]
      const t = rayQuadHit(o, d, q)

      expect(t).not.toBeNull()
      expect(t).toBeCloseTo(5)
    })
  })
})
