import { expect, test } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import {
  advanceCinematicAngle,
  cinematicOrbitPose,
  cinematicOrbitRadius,
} from '../../src/render/entity/cinematic-camera.js'
import { overheadFootHeight } from '../../src/render/entity/driving-camera.js'
import { gameCameraDefaults, resolveGameCameraSettings } from '../../src/config/camera.js'

test('cinematic radius scales the chase distance and respects the minimum', () => {
  const d = gameCameraDefaults
  expect(cinematicOrbitRadius(undefined)).toBe(
    Math.max(d.cinematicMinDistance, d.chaseDistance * d.cinematicDistanceScale),
  )
  expect(cinematicOrbitRadius(1)).toBe(d.cinematicMinDistance)
  expect(cinematicOrbitRadius(10)).toBeCloseTo(10 * d.cinematicDistanceScale)
  expect(cinematicOrbitRadius(10, 2)).toBeCloseTo(20 * d.cinematicDistanceScale)
})

test('cinematic angle advances one turn per orbit period, capped per step and wrapped', () => {
  const s = resolveGameCameraSettings({ cinematicOrbitSeconds: 40 })
  expect(advanceCinematicAngle(0, 0.1, s)).toBeCloseTo((0.1 / 40) * Math.PI * 2)
  // Frame stalls are capped by maxStepSeconds like every camera damping step.
  expect(advanceCinematicAngle(0, 5, s)).toBeCloseTo((s.maxStepSeconds / 40) * Math.PI * 2)
  expect(advanceCinematicAngle(Math.PI * 2 - 1e-3, 0.1, s)).toBeLessThan(0.02)
  const still = resolveGameCameraSettings({ cinematicOrbitSeconds: 0 })
  expect(advanceCinematicAngle(1, 0.1, still)).toBe(1)
})

test('cinematic pose uses the chase-yaw convention and an optional local frame', () => {
  const pose = cinematicOrbitPose({ target: [1, 2, 3], angle: 0 })
  const r = cinematicOrbitRadius(undefined)
  expect(pose.position.x).toBeCloseTo(1)
  expect(pose.position.z).toBeCloseTo(3 + r)
  expect(pose.position.y).toBeCloseTo(2 + r * gameCameraDefaults.cinematicElevation)
  expect(pose.target.toArray()).toEqual([1, 2, 3])
  const frame = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
  const turned = cinematicOrbitPose({ target: [0, 0, 0], angle: 0, frame })
  expect(turned.position.x).toBeCloseTo(r)
  expect(turned.position.z).toBeCloseTo(0)
})

test('on-foot overhead height follows zoom between 0.75× and 3× of footMapHeight', () => {
  const h = gameCameraDefaults.footMapHeight
  expect(overheadFootHeight(0)).toBe(h)
  expect(overheadFootHeight(0, 0.75)).toBeCloseTo(h * 0.75)
  expect(overheadFootHeight(0, 0.1)).toBeCloseTo(h * 0.75)
  expect(overheadFootHeight(0, 3)).toBeCloseTo(h * 3)
  expect(overheadFootHeight(0, 99)).toBeCloseTo(h * 3)
  expect(overheadFootHeight(5)).toBeGreaterThan(h)
  expect(() => resolveGameCameraSettings({ footMapHeight: 0 })).toThrow(RangeError)
  expect(() => resolveGameCameraSettings({ footMapHeight: 700 })).toThrow(RangeError)
  expect(() => resolveGameCameraSettings({ cinematicFov: 200 })).toThrow(RangeError)
})
