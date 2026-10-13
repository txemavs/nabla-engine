import { expect, it } from 'vitest'
import { ActionCam } from '../../src/runtime/action-cam.js'
const walking = { speed: 4, grounded: true, right: 0, yaw: 0, aim: 0 }
it('applies live settings per camera and rejects invalid persisted values', () => {
  const a = new ActionCam(),
    b = new ActionCam()
  a.setSettings({
    strideMetres: 0,
    response: NaN,
    bobMetres: 0,
    swayMetres: 0,
    stepPitchRadians: 0,
    stepRollRadians: 0,
  })
  expect(a.settings.strideMetres).toBe(0.8)
  expect(Number.isFinite(a.settings.response)).toBe(true)
  expect(b.settings.bobMetres).toBeGreaterThan(0)
  for (let i = 0; i < 60; i++) a.step(1 / 60, walking)
  for (const value of Object.values(a.step(1 / 60, walking))) expect(Math.abs(value)).toBe(0)
  a.resetSettings()
  expect(a.settings).toEqual(b.settings)
})
it('uses travelled distance consistently across frame rates', () => {
  const run = (fps: number) => {
    const cam = new ActionCam()
    let motion
    for (let i = 0; i < fps * 2; i++) motion = cam.step(1 / fps, walking)
    return motion!
  }
  const a = run(30),
    b = run(120)
  for (const key of ['side', 'up', 'pitch', 'roll'] as const) expect(a[key]).toBeCloseTo(b[key], 6)
})
it('eases to rest, attenuates while aiming and resets without residual tilt', () => {
  const free = new ActionCam(),
    aimed = new ActionCam()
  let a, b
  for (let i = 0; i < 130; i++) {
    a = free.step(1 / 60, walking)
    b = aimed.step(1 / 60, { ...walking, aim: 1 })
  }
  expect(Math.abs(b!.side)).toBeLessThan(Math.abs(a!.side) * 0.3)
  for (let i = 0; i < 180; i++) a = free.step(1 / 60, { ...walking, speed: 0 })
  expect(Math.abs(a!.up)).toBeLessThan(1e-7)
  free.reset()
  expect(free.step(0, walking)).toEqual({ side: 0, up: 0, pitch: 0, roll: 0 })
})
it('bounds rapid turning and fades the walking rhythm while airborne', () => {
  const cam = new ActionCam()
  let motion
  for (let i = 0; i < 90; i++)
    motion = cam.step(1 / 60, { ...walking, right: 1, yaw: i % 2 ? Math.PI : 0 })
  expect(Math.abs(motion!.roll)).toBeLessThan(0.1)
  for (let i = 0; i < 180; i++)
    motion = cam.step(1 / 60, { ...walking, speed: 20, grounded: false })
  expect(Math.abs(motion!.side)).toBeLessThan(1e-7)
})
