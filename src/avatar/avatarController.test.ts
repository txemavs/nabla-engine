import { describe, it, expect } from 'vitest'
import {
  createAvatarState,
  emptyAvatarInput,
  stepAvatar,
  LOOK_SENS,
} from './avatarController.js'
import { WALK_EYE_HEIGHT_MM } from './walkBody.js'

describe('avatarController coordinate system', () => {
  describe('initial state', () => {
    it('spawns at y = eye height above floor', () => {
      const state = createAvatarState({ x: 0, z: 0 })
      expect(state.y).toBeCloseTo(WALK_EYE_HEIGHT_MM / 1000)
    })

    it('spawns with yaw=0, pitch=0 (level horizon)', () => {
      const state = createAvatarState()
      expect(state.yaw).toBe(0)
      expect(state.pitch).toBe(0)
    })
  })

  describe('mouse look (FPS standard)', () => {
    it('mouse right (dx > 0) turns view right (yaw decreases)', () => {
      const state = createAvatarState()
      const input = { ...emptyAvatarInput(), lookDx: 10 }
      const next = stepAvatar(state, input, 0.016, 0)
      expect(next.yaw).toBeLessThan(state.yaw)
    })

    it('mouse left (dx < 0) turns view left (yaw increases)', () => {
      const state = createAvatarState()
      const input = { ...emptyAvatarInput(), lookDx: -10 }
      const next = stepAvatar(state, input, 0.016, 0)
      expect(next.yaw).toBeGreaterThan(state.yaw)
    })

    it('mouse up (dy < 0, typical browser) looks up (pitch increases)', () => {
      const state = createAvatarState()
      const input = { ...emptyAvatarInput(), lookDy: -10 }
      const next = stepAvatar(state, input, 0.016, 0)
      expect(next.pitch).toBeGreaterThan(state.pitch)
    })

    it('mouse down (dy > 0) looks down (pitch decreases)', () => {
      const state = createAvatarState()
      const input = { ...emptyAvatarInput(), lookDy: 10 }
      const next = stepAvatar(state, input, 0.016, 0)
      expect(next.pitch).toBeLessThan(state.pitch)
    })

    it('sensitivity matches LOOK_SENS constant', () => {
      const state = createAvatarState()
      const dx = 10
      const input = { ...emptyAvatarInput(), lookDx: dx }
      const next = stepAvatar(state, input, 0.016, 0)
      expect(next.yaw).toBeCloseTo(-dx * LOOK_SENS)
    })
  })

  describe('WASD movement direction at yaw=0', () => {
    it('W moves toward -Z (forward at yaw=0)', () => {
      const state = { ...createAvatarState(), grounded: true }
      const input = { ...emptyAvatarInput(), forward: true }
      let s = state
      for (let i = 0; i < 30; i++) {
        s = stepAvatar(s, input, 0.016, 0)
      }
      expect(s.z).toBeLessThan(state.z)
      expect(Math.abs(s.x - state.x)).toBeLessThan(0.01)
    })

    it('S moves toward +Z (backward at yaw=0)', () => {
      const state = { ...createAvatarState(), grounded: true }
      const input = { ...emptyAvatarInput(), backward: true }
      let s = state
      for (let i = 0; i < 30; i++) {
        s = stepAvatar(s, input, 0.016, 0)
      }
      expect(s.z).toBeGreaterThan(state.z)
    })

    it('D moves toward +X (right at yaw=0)', () => {
      const state = { ...createAvatarState(), grounded: true }
      const input = { ...emptyAvatarInput(), right: true }
      let s = state
      for (let i = 0; i < 30; i++) {
        s = stepAvatar(s, input, 0.016, 0)
      }
      expect(s.x).toBeGreaterThan(state.x)
      expect(Math.abs(s.z - state.z)).toBeLessThan(0.01)
    })

    it('A moves toward -X (left at yaw=0)', () => {
      const state = { ...createAvatarState(), grounded: true }
      const input = { ...emptyAvatarInput(), left: true }
      let s = state
      for (let i = 0; i < 30; i++) {
        s = stepAvatar(s, input, 0.016, 0)
      }
      expect(s.x).toBeLessThan(state.x)
    })
  })

  describe('WASD movement direction at yaw=90 (turned left)', () => {
    it('W moves toward -X when facing left (yaw=90)', () => {
      const state = { ...createAvatarState({ yaw: 90 }), grounded: true }
      const input = { ...emptyAvatarInput(), forward: true }
      let s = state
      for (let i = 0; i < 30; i++) {
        s = stepAvatar(s, input, 0.016, 0)
      }
      expect(s.x).toBeLessThan(state.x)
      expect(Math.abs(s.z - state.z)).toBeLessThan(0.1)
    })

    it('D moves toward -Z when facing left (yaw=90)', () => {
      const state = { ...createAvatarState({ yaw: 90 }), grounded: true }
      const input = { ...emptyAvatarInput(), right: true }
      let s = state
      for (let i = 0; i < 30; i++) {
        s = stepAvatar(s, input, 0.016, 0)
      }
      expect(s.z).toBeLessThan(state.z)
    })
  })

  describe('gravity and jump', () => {
    it('falls when above floor', () => {
      const state = { ...createAvatarState({ y: 5 }), grounded: false, vy: 0 }
      const input = emptyAvatarInput()
      let s = state
      for (let i = 0; i < 10; i++) {
        s = stepAvatar(s, input, 0.016, 0)
      }
      expect(s.y).toBeLessThan(state.y)
    })

    it('jump gives positive vy (upward)', () => {
      const state = { ...createAvatarState(), grounded: true }
      const input = { ...emptyAvatarInput(), jump: true }
      const next = stepAvatar(state, input, 0.016, 0)
      expect(next.vy).toBeGreaterThan(0)
    })
  })
})
