/**
 * Ride smoothing: the view and the seated avatar absorb small, fast bounce at speed, follow
 * slopes and steady lean without lag, stay within a few centimetres / degrees of the body, and
 * follow crashes exactly.
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { rideSmoothingDefaults } from '../../src/config/camera.js'
import {
  RideSmoothing,
  rideSmoothingClass,
  rideSmoothingSettings,
} from '../../src/render/entity/ride-smoothing.js'

const car = rideSmoothingDefaults.car
const hz = 60
const deg = THREE.MathUtils.degToRad

/** A pose: position and pitch / roll / heading (radians) as a quaternion. */
const pose = (y: number, z: number, pitch = 0, roll = 0, heading = 0) => ({
  position: [0, y, z],
  rotation: new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(pitch, heading, roll, 'YXZ'))
    .toArray(),
})

/** Smoothed height offset and tilt (degrees from the real body) over a run. */
function ride(
  path: (t: number) => ReturnType<typeof pose>,
  seconds: number,
  settings = car,
  bypass: (t: number) => boolean = () => false,
) {
  const smoothing = new RideSmoothing()
  const frames: { t: number; y: number; offset: number; tilt: number; up: THREE.Vector3 }[] = []
  for (let i = 0; i <= seconds * hz; i++) {
    const t = i / hz
    const p = path(t)
    smoothing.update('car', p.position, p.rotation, 1 / hz, settings, bypass(t))
    const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
      new THREE.Quaternion().fromArray(p.rotation),
    )
    const up = bodyUp.clone().applyQuaternion(smoothing.correction)
    frames.push({
      t,
      y: smoothing.position.y,
      offset: smoothing.offset('car').y,
      tilt: THREE.MathUtils.radToDeg(up.angleTo(bodyUp)),
      up,
    })
  }
  return { frames, smoothing }
}

const swing = (values: number[]) => Math.max(...values) - Math.min(...values)

describe('ride smoothing', () => {
  it('picks the class defaults and the preset strength', () => {
    expect(rideSmoothingClass(presetVehicle('car', 'car', [0, 1, 0]))).toBe('car')
    expect(rideSmoothingClass(presetVehicle('vfr800', 'bike', [0, 1, 0]))).toBe('motorcycle')
    expect(rideSmoothingClass(presetVehicle('white-truck', 'truck', [0, 1, 0]))).toBe('truck')
    const s3 = presetVehicle('car', 'car', [0, 1, 0])
    expect(rideSmoothingSettings(s3)).toEqual(car)
    s3.vehicle!.rideSmoothing = 0.2
    expect(rideSmoothingSettings(s3)).toEqual({ ...car, strength: 0.2 })
    for (const kind of ['car', 'motorcycle', 'truck'] as const) {
      const s = rideSmoothingDefaults[kind]
      expect(s.strength).toBeGreaterThan(0.3)
      expect(s.seconds).toBeGreaterThanOrEqual(0.15)
      expect(s.seconds).toBeLessThanOrEqual(0.3)
    }
    expect(rideSmoothingDefaults.off.strength).toBe(0)
  })

  it('absorbs fast road bounce at full speed (height and pitch / roll)', () => {
    // 70 m/s (250 km/h) along -Z; 1.5 cm and 1° of bounce at 8 Hz on top.
    const bounce = (t: number) => Math.sin(2 * Math.PI * 8 * t)
    const { frames } = ride(
      (t) =>
        pose(0.6 + 0.015 * bounce(t), -70 * t, deg(1) * bounce(t), deg(0.8) * bounce(t + 0.03)),
      4,
    )
    const late = frames.filter((f) => f.t > 1)
    // The real body moves 3 cm peak to peak; the view less than 60% of that.
    expect(swing(late.map((f) => f.y))).toBeLessThan(0.03 * 0.6)
    // Tilt: the smoothed up stays steadier than the body's ±1°.
    const pitches = late.map((f) => THREE.MathUtils.radToDeg(Math.atan2(f.up.z, f.up.y)))
    expect(swing(pitches)).toBeLessThan(2 * 0.6)
  })

  it('follows slopes, crests and a steady lean without lag', () => {
    // A 5% climb at 250 km/h (3.5 m/s up), then a crest into a 5% descent.
    const height = (t: number) => (t < 2 ? 3.5 * t : 7 - 3.5 * (t - 2))
    const climb = ride((t) => pose(height(t), -70 * t, deg(2.9)), 4).frames
    for (const f of climb.filter((f) => (f.t > 1.2 && f.t < 2) || f.t > 3.2))
      expect(Math.abs(f.offset)).toBeLessThan(0.002)
    // Never more than the bound, even right at the crest.
    for (const f of climb) expect(Math.abs(f.offset)).toBeLessThanOrEqual(car.maxOffset + 1e-9)
    // A motorcycle rolling into a 40° lean at 0.5 rad/s, held: settles onto the real lean.
    const bike = rideSmoothingDefaults.motorcycle
    const lean = (t: number) => -Math.min(deg(40), 0.5 * Math.max(0, t - 0.5))
    const leaning = ride((t) => pose(0.6, -30 * t, 0, lean(t)), 4, bike).frames
    for (const f of leaning) expect(f.tilt).toBeLessThanOrEqual(bike.maxTilt + 1e-6)
    for (const f of leaning.filter((f) => f.t > 3)) expect(f.tilt).toBeLessThan(0.05)
  })

  it('stays within a few centimetres of the body through a jump and a hard landing', () => {
    // Airborne for 0.6 s (falling at up to 6 m/s), then a sudden stop on landing and a nose dip.
    const y = (t: number) =>
      t < 1 ? 0.6 : t < 1.6 ? 0.6 + 3 * (t - 1) - 4.9 * (t - 1) ** 2 * 1.7 : 0.6
    const { frames } = ride(
      (t) => pose(Math.max(0.6, y(t)), -30 * t, t > 1.6 && t < 1.7 ? deg(6) : 0),
      3,
    )
    for (const f of frames) {
      expect(Math.abs(f.offset)).toBeLessThanOrEqual(car.maxOffset + 1e-9)
      expect(f.tilt).toBeLessThanOrEqual(car.maxTilt + 1e-6)
    }
  })

  it('follows a crash exactly and keeps attached poses on the vehicle', () => {
    const bounce = (t: number) => 0.6 + 0.02 * Math.sin(2 * Math.PI * 7 * t)
    const { frames } = ride(
      (t) => pose(bounce(t), -40 * t, 0, t > 2 ? deg(60) : 0),
      3,
      car,
      (t) => t > 2,
    )
    for (const f of frames.filter((f) => f.t > 2)) {
      expect(f.offset).toBe(0)
      expect(f.tilt).toBe(0)
    }
    // A point 1.4 m above the body (the eye) never moves more than the bounds allow.
    const smoothing = new RideSmoothing()
    let worst = 0
    for (let i = 0; i < 3 * hz; i++) {
      const t = i / hz
      const p = pose(bounce(t), -40 * t, deg(1.5) * Math.sin(2 * Math.PI * 6 * t))
      smoothing.update('car', p.position, p.rotation, 1 / hz, car)
      const eye = new THREE.Vector3(0, 1.4, 0)
        .applyQuaternion(new THREE.Quaternion().fromArray(p.rotation))
        .add(new THREE.Vector3().fromArray(p.position))
      const moved = eye.clone()
      expect(smoothing.apply('car', moved)).toBe(true)
      worst = Math.max(worst, moved.distanceTo(eye))
    }
    expect(worst).toBeLessThan(car.maxOffset + 1.4 * Math.tan(deg(car.maxTilt)) + 1e-6)
    expect(smoothing.apply('other', new THREE.Vector3())).toBe(false)
  })

  it('never filters heading or horizontal motion, and is off for strength 0', () => {
    const { frames } = ride((t) => pose(0.6, -30 * t, 0, 0, 2 * t), 2)
    for (const f of frames) {
      expect(Math.abs(f.offset)).toBeLessThan(1e-9)
      expect(f.tilt).toBeLessThan(1e-6)
    }
    const off = ride(
      (t) => pose(0.6 + 0.02 * Math.sin(40 * t), -30 * t, 0.02 * Math.sin(40 * t)),
      1,
      rideSmoothingDefaults.off,
    ).frames
    for (const f of off) {
      expect(f.offset).toBe(0)
      expect(f.tilt).toBe(0)
    }
  })
})
