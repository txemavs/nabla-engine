import { expect, it, describe, beforeEach, afterEach } from 'vitest'
import { Vector3 } from 'three'
import { DrivingController } from '../../src/driving/controller.js'

describe('DrivingController', () => {
  let controller: DrivingController

  beforeEach(() => {
    controller = new DrivingController({ enableAudio: false })
  })

  afterEach(() => {
    controller.dispose()
  })

  describe('camera modes', () => {
    it('starts with cockpit mode by default', () => {
      const ctrl = new DrivingController()
      expect(ctrl.getCameraMode()).toBe('cockpit')
      ctrl.dispose()
    })

    it('accepts initial camera mode option', () => {
      const ctrl = new DrivingController({ initialCameraMode: 'chase' })
      expect(ctrl.getCameraMode()).toBe('chase')
      ctrl.dispose()
    })

    it('cycles through camera modes: chase -> cockpit -> map -> chase', () => {
      controller.setCameraMode('chase')
      expect(controller.getCameraMode()).toBe('chase')

      expect(controller.cycleCamera()).toBe('cockpit')
      expect(controller.getCameraMode()).toBe('cockpit')

      expect(controller.cycleCamera()).toBe('map')
      expect(controller.getCameraMode()).toBe('map')

      expect(controller.cycleCamera()).toBe('chase')
      expect(controller.getCameraMode()).toBe('chase')
    })

    it('allows setting camera mode directly', () => {
      controller.setCameraMode('map')
      expect(controller.getCameraMode()).toBe('map')

      controller.setCameraMode('cockpit')
      expect(controller.getCameraMode()).toBe('cockpit')
    })
  })

  describe('telemetry', () => {
    it('returns zero telemetry when no simulation', () => {
      controller.update(null, 0.016)
      const telemetry = controller.getTelemetry()
      expect(telemetry.speed).toBe(0)
      expect(telemetry.turnRate).toBe(0)
    })
  })

  describe('camera computation', () => {
    it('returns default camera state when no simulation', () => {
      const state = controller.computeCamera(null, 0.016)
      expect(state.position).toBeInstanceOf(Vector3)
      expect(state.target).toBeInstanceOf(Vector3)
      expect(state.up).toBeInstanceOf(Vector3)
      expect(state.fov).toBeGreaterThan(0)
    })

    it('uses custom ground up vector', () => {
      const customUp = new Vector3(0, 1, 0.1).normalize()
      const state = controller.computeCamera(null, 0.016, customUp)
      expect(state.up.length()).toBeCloseTo(1)
    })
  })

  describe('map zoom', () => {
    it('clamps map zoom to valid range', () => {
      controller.setMapZoom(0.5)
      controller.setMapZoom(5.0)
      controller.setMapZoom(1.5)
    })
  })

  describe('audio', () => {
    it('can toggle audio enabled state', () => {
      controller.setAudioEnabled(false)
      controller.setAudioEnabled(true)
    })

    it('can suspend audio for visibility', () => {
      controller.setAudioSuspended(true)
      controller.setAudioSuspended(false)
    })

    it('unlocks audio context', () => {
      controller.unlockAudio()
    })
  })

  describe('manual look', () => {
    it('tracks manual look time for heading follow delay', () => {
      controller.notifyManualLook()
    })
  })
})
