import { describe, it, expect } from 'vitest'
import {
  apertureEyeCss,
  apertureViewProjParts,
  apertureViewProj,
  css3dWindowView,
  portalApertureView,
  type ApertureCorners,
} from './portalView.js'
import { STAGE_PERSPECTIVE } from '../pose.js'
import type { Vec3 } from './glMath.js'

describe('portalView', () => {
  describe('apertureEyeCss', () => {
    it('offsets camera z by STAGE_PERSPECTIVE', () => {
      const cam = { x: 100, y: -500, z: 1100 }
      const eye = apertureEyeCss(cam)
      expect(eye[0]).toBe(100)
      expect(eye[1]).toBe(-500)
      expect(eye[2]).toBe(1100 + STAGE_PERSPECTIVE)
    })

    it('preserves x and y unchanged', () => {
      const cam = { x: -200, y: 300, z: 0 }
      const eye = apertureEyeCss(cam)
      expect(eye[0]).toBe(-200)
      expect(eye[1]).toBe(300)
    })
  })

  describe('apertureViewProjParts', () => {
    const eye: Vec3 = [0, -900, 2300]
    const pa: Vec3 = [-2500, 0, 0]
    const pb: Vec3 = [2500, 0, 0]
    const pc: Vec3 = [-2500, -3200, 0]

    it('returns view+proj matrices for valid geometry', () => {
      const result = apertureViewProjParts(eye, pa, pb, pc)
      expect(result).not.toBeNull()
      expect(result!.mvp).toBeInstanceOf(Float32Array)
      expect(result!.mvp.length).toBe(16)
      expect(result!.view).toBeInstanceOf(Float32Array)
      expect(result!.view.length).toBe(16)
      expect(result!.proj).toBeInstanceOf(Float32Array)
      expect(result!.proj.length).toBe(16)
      expect(result!.near).toBeGreaterThan(0)
      expect(result!.far).toBe(2_500_000)
    })

    it('returns null when eye is behind the plane', () => {
      const behindEye: Vec3 = [0, -900, -100]
      const result = apertureViewProjParts(behindEye, pa, pb, pc)
      expect(result).toBeNull()
    })

    it('returns null when eye is too close to the plane', () => {
      const closeEye: Vec3 = [0, -900, 20]
      const result = apertureViewProjParts(closeEye, pa, pb, pc)
      expect(result).toBeNull()
    })

    it('accepts custom far plane', () => {
      const result = apertureViewProjParts(eye, pa, pb, pc, 1_000_000)
      expect(result).not.toBeNull()
      expect(result!.far).toBe(1_000_000)
    })

    it('produces asymmetric frustum for off-center eye', () => {
      const offCenterEye: Vec3 = [1000, -900, 2300]
      const result = apertureViewProjParts(offCenterEye, pa, pb, pc)
      expect(result).not.toBeNull()
      expect(result!.proj[8]).not.toBe(0)
    })
  })

  describe('apertureViewProj', () => {
    const eye: Vec3 = [0, -900, 2300]
    const pa: Vec3 = [-2500, 0, 0]
    const pb: Vec3 = [2500, 0, 0]
    const pc: Vec3 = [-2500, -3200, 0]

    it('returns just the MVP matrix', () => {
      const mvp = apertureViewProj(eye, pa, pb, pc)
      expect(mvp).toBeInstanceOf(Float32Array)
      expect(mvp!.length).toBe(16)
    })

    it('returns null for invalid geometry', () => {
      const behindEye: Vec3 = [0, -900, -100]
      const result = apertureViewProj(behindEye, pa, pb, pc)
      expect(result).toBeNull()
    })

    it('matches mvp from apertureViewProjParts', () => {
      const mvp = apertureViewProj(eye, pa, pb, pc)
      const parts = apertureViewProjParts(eye, pa, pb, pc)
      expect(mvp).toEqual(parts!.mvp)
    })
  })

  describe('css3dWindowView', () => {
    const cam = { x: 0, y: -900, z: 1100 }
    const aperture: ApertureCorners = {
      pa: [-2500, 0, 0],
      pb: [2500, 0, 0],
      pc: [-2500, -3200, 0],
    }

    it('computes view from StageCamera through window', () => {
      const result = css3dWindowView(cam, aperture)
      expect(result).not.toBeNull()
      expect(result!.mvp).toBeInstanceOf(Float32Array)
    })

    it('applies STAGE_PERSPECTIVE offset to camera z', () => {
      const directEye = apertureEyeCss(cam)
      const directResult = apertureViewProjParts(
        directEye,
        aperture.pa,
        aperture.pb,
        aperture.pc,
      )
      const windowResult = css3dWindowView(cam, aperture)
      expect(windowResult!.mvp).toEqual(directResult!.mvp)
    })
  })

  describe('portalApertureView', () => {
    const eye: Vec3 = [0, -1600, 3000]
    const aperture: ApertureCorners = {
      pa: [-1000, 0, 0],
      pb: [1000, 0, 0],
      pc: [-1000, -2000, 0],
    }

    it('computes view through portal mouth', () => {
      const result = portalApertureView(eye, aperture)
      expect(result).not.toBeNull()
      expect(result!.mvp).toBeInstanceOf(Float32Array)
    })

    it('equals apertureViewProjParts with same inputs', () => {
      const result = portalApertureView(eye, aperture)
      const direct = apertureViewProjParts(eye, aperture.pa, aperture.pb, aperture.pc)
      expect(result!.mvp).toEqual(direct!.mvp)
    })

    it('works with custom far plane', () => {
      const result = portalApertureView(eye, aperture, 500_000)
      expect(result).not.toBeNull()
      expect(result!.far).toBe(500_000)
    })
  })

  describe('projection contract', () => {
    it('near plane is always in front of eye', () => {
      const eye: Vec3 = [0, -900, 2300]
      const pa: Vec3 = [-2500, 0, 0]
      const pb: Vec3 = [2500, 0, 0]
      const pc: Vec3 = [-2500, -3200, 0]
      const result = apertureViewProjParts(eye, pa, pb, pc)
      expect(result!.near).toBeGreaterThan(0)
      expect(result!.near).toBeLessThan(result!.far)
    })

    it('view matrix is column-major 4x4', () => {
      const eye: Vec3 = [0, -900, 2300]
      const pa: Vec3 = [-2500, 0, 0]
      const pb: Vec3 = [2500, 0, 0]
      const pc: Vec3 = [-2500, -3200, 0]
      const result = apertureViewProjParts(eye, pa, pb, pc)
      expect(result!.view[3]).toBe(0)
      expect(result!.view[7]).toBe(0)
      expect(result!.view[11]).toBe(0)
      expect(result!.view[15]).toBe(1)
    })
  })
})
