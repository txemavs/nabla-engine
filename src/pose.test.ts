import { describe, it, expect } from 'vitest'
import {
  parsePose,
  isIdentityPose,
  IDENTITY_POSE,
  parseStageMode,
  clampStageCamera,
  parseStageCamera,
  isIdentityCamera,
  IDENTITY_STAGE_CAMERA,
  stageViewTransform,
  stageWalkDelta,
  stageLookDelta,
  approachVel2,
  type StageCamera,
} from './pose.js'

describe('pose', () => {
  describe('parsePose', () => {
    it('parses valid pose', () => {
      const pose = parsePose({ x: 1, y: 2, z: 3, rx: 10, ry: 20, rz: 30, scale: 2 })
      expect(pose.x).toBe(1)
      expect(pose.y).toBe(2)
      expect(pose.z).toBe(3)
      expect(pose.rx).toBe(10)
      expect(pose.ry).toBe(20)
      expect(pose.rz).toBe(30)
      expect(pose.scale).toBe(2)
    })

    it('returns empty pose for invalid input', () => {
      expect(parsePose(null)).toEqual({})
      expect(parsePose(undefined)).toEqual({})
      expect(parsePose([])).toEqual({})
      expect(parsePose('string')).toEqual({})
    })

    it('handles partial pose', () => {
      const pose = parsePose({ x: 5 })
      expect(pose.x).toBe(5)
      expect(pose.y).toBeUndefined()
    })
  })

  describe('isIdentityPose', () => {
    it('returns true for identity pose', () => {
      expect(isIdentityPose(IDENTITY_POSE)).toBe(true)
      expect(isIdentityPose({})).toBe(true)
    })

    it('returns false for non-identity pose', () => {
      expect(isIdentityPose({ x: 1 })).toBe(false)
      expect(isIdentityPose({ scale: 2 })).toBe(false)
    })
  })

  describe('parseStageMode', () => {
    it('parses edit mode', () => {
      expect(parseStageMode('edit')).toBe('edit')
    })

    it('defaults to helm', () => {
      expect(parseStageMode('helm')).toBe('helm')
      expect(parseStageMode(null)).toBe('helm')
      expect(parseStageMode('invalid')).toBe('helm')
    })
  })

  describe('clampStageCamera', () => {
    it('clamps pitch', () => {
      const cam = clampStageCamera({ rx: 100 })
      expect(cam.rx).toBeLessThanOrEqual(89.5)
    })

    it('wraps yaw', () => {
      const cam = clampStageCamera({ ry: 270 })
      expect(cam.ry).toBeCloseTo(-90)
    })

    it('preserves valid values', () => {
      const cam = clampStageCamera({ x: 100, y: -500, z: 1000, rx: 45, ry: 90 })
      expect(cam.x).toBe(100)
      expect(cam.y).toBe(-500)
      expect(cam.z).toBe(1000)
      expect(cam.rx).toBe(45)
      expect(cam.ry).toBe(90)
    })
  })

  describe('parseStageCamera', () => {
    it('parses valid camera', () => {
      const cam = parseStageCamera({ x: 10, y: -100, z: 500, rx: 15, ry: 30 })
      expect(cam.x).toBe(10)
      expect(cam.y).toBe(-100)
      expect(cam.z).toBe(500)
    })

    it('returns identity for invalid input', () => {
      const cam = parseStageCamera(null)
      expect(cam).toEqual(IDENTITY_STAGE_CAMERA)
    })

    it('returns identity for legacy orbit format', () => {
      const cam = parseStageCamera({ distance: 1000, ox: 50 })
      expect(cam).toEqual(IDENTITY_STAGE_CAMERA)
    })
  })

  describe('isIdentityCamera', () => {
    it('returns true for identity camera', () => {
      expect(isIdentityCamera(IDENTITY_STAGE_CAMERA)).toBe(true)
    })

    it('returns false for non-identity camera', () => {
      expect(isIdentityCamera({ ...IDENTITY_STAGE_CAMERA, x: 10 })).toBe(false)
    })
  })

  describe('stageViewTransform', () => {
    it('generates CSS transform', () => {
      const cam: StageCamera = { x: 0, y: 0, z: 1000, rx: 0, ry: 0 }
      const transform = stageViewTransform(cam)
      expect(transform).toContain('rotateX(')
      expect(transform).toContain('rotateY(')
      expect(transform).toContain('translate3d(')
    })

    it('applies edge zoom', () => {
      const cam: StageCamera = { x: 0, y: 0, z: 1000, rx: 0, ry: 0 }
      const transform = stageViewTransform(cam, 1.5)
      expect(transform).toContain('-1500px') // z * edgeZoom
    })
  })

  describe('stageWalkDelta', () => {
    it('returns zero delta when no keys pressed', () => {
      const cam: StageCamera = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }
      const delta = stageWalkDelta(cam, {}, 0.016)
      expect(delta.x).toBe(0)
      expect(delta.z).toBe(0)
    })

    it('moves forward when W pressed', () => {
      const cam: StageCamera = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }
      const delta = stageWalkDelta(cam, { w: true }, 0.016)
      expect(delta.z).toBeLessThan(0) // -Z is forward in CSS
    })

    it('moves backward when S pressed', () => {
      const cam: StageCamera = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }
      const delta = stageWalkDelta(cam, { s: true }, 0.016)
      expect(delta.z).toBeGreaterThan(0)
    })
  })

  describe('stageLookDelta', () => {
    it('computes look delta from mouse movement', () => {
      const delta = stageLookDelta(10, 5)
      expect(delta.ry).toBeLessThan(0) // dx right → yaw left
      expect(delta.rx).toBeGreaterThan(0) // dy down → pitch down
    })

    it('returns zero for zero movement', () => {
      const delta = stageLookDelta(0, 0)
      expect(delta.rx).toBeCloseTo(0)
      expect(delta.ry).toBeCloseTo(0)
    })
  })

  describe('approachVel2', () => {
    it('accelerates toward wish velocity', () => {
      const vel = { x: 0, z: 0 }
      const wish = { x: 100, z: 0 }
      const next = approachVel2(vel, wish, 0.016)
      expect(next.x).toBeGreaterThan(0)
      expect(next.x).toBeLessThanOrEqual(100) // may reach target in one step
    })

    it('decelerates toward zero', () => {
      const vel = { x: 100, z: 0 }
      const wish = { x: 0, z: 0 }
      const next = approachVel2(vel, wish, 0.016)
      expect(next.x).toBeLessThan(100)
      expect(next.x).toBeGreaterThanOrEqual(0) // may reach target in one step
    })

    it('returns exact wish when close enough', () => {
      const vel = { x: 99.9, z: 0 }
      const wish = { x: 100, z: 0 }
      const next = approachVel2(vel, wish, 1)
      expect(next.x).toBe(100)
    })
  })
})
