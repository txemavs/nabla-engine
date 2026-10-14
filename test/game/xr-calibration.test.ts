import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { XRCalibration } from '../../src/runtime/xr-calibration.js'

it('applies local centimetres and angles without accumulating over XR frames', () => {
  const calibration = new XRCalibration(),
    object = new THREE.Group()
  object.position.set(0.25, -0.5, -0.1)
  object.rotation.x = -Math.PI / 2
  const rest = object.quaternion.clone()
  calibration.set('magazine-normal', { x: 2, y: -3, rz: 90 }, false)
  for (let i = 0; i < 100; i++) calibration.apply(object, 'magazine-normal')
  expect(object.position.toArray()).toEqual([0.27, -0.53, -0.1])
  expect(
    object.quaternion.angleTo(
      rest
        .clone()
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))),
    ),
  ).toBeCloseTo(0)
  calibration.reset('magazine-normal')
  calibration.apply(object, 'magazine-normal')
  expect(object.position.toArray()).toEqual([0.25, -0.5, -0.1])
  expect(object.quaternion.angleTo(rest)).toBeCloseTo(0)
})

it('exports mirrored objects with explicit units and rejects invalid numbers', () => {
  const calibration = new XRCalibration()
  calibration.set('hand-left', { rx: 12, y: 2, z: NaN }, false)
  calibration.set('hand-right', { rz: -30 }, false)
  const shared = JSON.parse(calibration.export())
  expect(shared.units).toEqual({ position: 'cm', rotation: 'degrees' })
  expect(shared.poses['hand-left']).toEqual({ x: 0, y: 2, z: 0, rx: 12, ry: 0, rz: 0 })
  expect(shared.poses['hand-right'].rz).toBe(-30)
})

it('bakes the supplied zero while exposing zero offsets for every object', () => {
  const c = new XRCalibration(),
    hand = new THREE.Group(),
    holster = new THREE.Group()
  c.apply(hand, 'hand-right')
  expect(hand.position.x).toBeCloseTo(0.01)
  expect(
    hand.quaternion.angleTo(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 4, 0, (-70 * Math.PI) / 180)),
    ),
  ).toBeCloseTo(0)
  c.apply(holster, 'holster-0')
  expect(holster.position.toArray()).toEqual([0.05, 0.1, 0.15])
  for (const id of Object.keys(c.objects) as (keyof typeof c.objects)[])
    if (id !== 'bike-controls') expect(Object.values(c.get(id))).toEqual([0, 0, 0, 0, 0, 0])
  expect(JSON.parse(c.export()).version).toBe(2)
})

it('does not reuse V1 values after baking them, and saves future adjustments in V2', () => {
  const storage = new Map([
    ['nabla.xr.calibration.v1', JSON.stringify({ 'hand-right': { x: 1, rx: -45, rz: -70 } })],
  ])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  try {
    const c = new XRCalibration()
    expect(c.get('hand-right').rx).toBe(0)
    c.set('hand-right', { rx: 5 })
    expect(new XRCalibration().get('hand-right').rx).toBe(5)
    expect(storage.has('nabla.xr.calibration.v1')).toBe(true)
    c.reset('hand-right')
    expect(new XRCalibration().get('hand-right').rx).toBe(0)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('preserves the former composed in-hand orientation for either pistol', () => {
  const c = new XRCalibration()
  for (const id of ['grip-left', 'grip-right'] as const) {
    const mount = new THREE.Group()
    mount.rotation.x = -Math.PI / 2
    c.apply(mount, id)
    const old = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)))
    expect(mount.quaternion.angleTo(old)).toBeCloseTo(0)
  }
})

it('mirrors either side, resets both and keeps holstered and held adjustments separate', () => {
  const c = new XRCalibration()
  c.set('grip-right', { x: 3, y: 4, z: 5, rx: 6, ry: 7, rz: 8 }, false)
  expect(c.get('grip-left')).toEqual({ x: -3, y: 4, z: 5, rx: 6, ry: -7, rz: -8 })
  expect(c.get('pistol-0').x).toBe(0)
  c.reset('grip-left')
  expect(Object.values(c.get('grip-right'))).toEqual([0, 0, 0, 0, 0, 0])
})

it('reconciles old asymmetric storage using the right side', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => JSON.stringify({ 'grip-left': { x: -2, ry: 8 }, 'grip-right': { x: 9 } }),
  })
  try {
    const c = new XRCalibration()
    expect(c.get('grip-left').x).toBe(-9)
    expect(c.get('grip-left').ry).toBe(0)
  } finally {
    vi.unstubAllGlobals()
  }
})
