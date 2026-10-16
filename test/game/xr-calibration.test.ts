import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { XRCalibration, xrHandZero } from '../../src/runtime/xr-calibration.js'

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
  expect(shared.poses['hand-left']).toEqual({ x: 0, y: 2, z: 0, rx: 12, ry: 0, rz: 30 })
  expect(shared.poses['hand-right'].rz).toBe(-30)
})

it('bakes the supplied zero while exposing zero offsets for every object', () => {
  const c = new XRCalibration(),
    hand = new THREE.Group(),
    holster = new THREE.Group()
  c.apply(hand, 'hand-right')
  expect(hand.position.toArray()).toEqual([0.02, -0.01, 0.01])
  expect(
    hand.quaternion.angleTo(
      new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(-Math.PI / 4, 0, (-70 * Math.PI) / 180))
        .multiply(
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler((3 * Math.PI) / 180, (-23 * Math.PI) / 180, (-4 * Math.PI) / 180),
          ),
        )
        .multiply(
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler((-20 * Math.PI) / 180, (10 * Math.PI) / 180, 0),
          ),
        ),
    ),
  ).toBeCloseTo(0)
  c.apply(holster, 'holster-0')
  expect(holster.position.toArray()).toEqual([0.05, 0.075, 0.2])
  for (const id of Object.keys(c.objects) as (keyof typeof c.objects)[])
    if (id !== 'bike-controls') expect(Object.values(c.get(id))).toEqual([0, 0, 0, 0, 0, 0])
  expect(JSON.parse(c.export()).version).toBe(5)
})

it('does not reuse V1 values after baking them, and saves future adjustments in V3', () => {
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

it('preserves the former pistol-to-hand relationship after accepting the new hand zero', () => {
  const c = new XRCalibration()
  for (const id of ['grip-left', 'grip-right'] as const) {
    const mount = new THREE.Group()
    mount.rotation.x = -Math.PI / 2
    c.apply(mount, id)
    const old = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)))
    const side = id === 'grip-left' ? -1 : 1
    old.multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          (6 * Math.PI) / 180,
          (side * 12 * Math.PI) / 180,
          (side * 6 * Math.PI) / 180,
        ),
      ),
    )
    const oldHand = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(-Math.PI / 4, 0, (side * -70 * Math.PI) / 180))
      .multiply(
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            (3 * Math.PI) / 180,
            (side * -23 * Math.PI) / 180,
            (side * -4 * Math.PI) / 180,
          ),
        ),
      )
    const visual = new THREE.Group()
    c.apply(visual, id === 'grip-left' ? 'hand-left' : 'hand-right')
    const relative = visual.quaternion.clone().invert().multiply(mount.quaternion)
    expect(relative.angleTo(oldHand.clone().invert().multiply(old))).toBeCloseTo(0)
    const oldRelativePosition = new THREE.Vector3(side * -0.015, 0, -0.005).applyQuaternion(
      oldHand.clone().invert(),
    )
    expect(
      mount.position
        .clone()
        .sub(visual.position)
        .applyQuaternion(visual.quaternion.clone().invert())
        .distanceTo(oldRelativePosition),
    ).toBeCloseTo(0)
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

it('mirrors calibrated hands in space and prioritizes the saved left hand', () => {
  vi.stubGlobal('localStorage', {
    getItem: () =>
      JSON.stringify({
        'hand-left': { x: -2, y: 3, z: -4, rx: 5, ry: -6, rz: -7 },
        'hand-right': { x: 25, ry: 40 },
      }),
  })
  try {
    const c = new XRCalibration()
    expect(c.get('hand-left')).toEqual({ x: -2, y: 3, z: -4, rx: 5, ry: -6, rz: -7 })
    expect(c.get('hand-right')).toEqual({ x: 2, y: 3, z: -4, rx: 5, ry: 6, rz: 7 })
    c.set('hand-left', { x: -4, ry: -12 }, false)
    expect(c.get('hand-right').x).toBe(4)
    expect(c.get('hand-right').ry).toBe(12)
    const right = new THREE.Group(),
      left = new THREE.Group()
    left.scale.x = -1
    c.apply(right, 'hand-right')
    c.apply(left, 'hand-left')
    const point = new THREE.Vector3(0.025, 0.015, -0.08)
    const r = right.localToWorld(point.clone()),
      l = left.localToWorld(point.clone())
    expect(l.x).toBeCloseTo(-r.x)
    expect(l.y).toBeCloseTo(r.y)
    expect(l.z).toBeCloseTo(r.z)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('bakes V2 once and moves both chest pockets from the shared adjustment', () => {
  const stored = JSON.stringify({
    'hand-left': { x: 1, z: 0.5, rx: 3, ry: 23, rz: 4 },
    'pocket-0': { x: 8 },
  })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === 'nabla.xr.calibration.v2' ? stored : null),
  })
  try {
    const c = new XRCalibration()
    expect(c.get('hand-left').x).toBe(0)
    expect(c.get('pocket-0').x).toBe(0)
    expect(c.editableObjects['pocket-1']).toBeUndefined()
    c.set('pocket-0', { x: 2, y: 3 }, false)
    const left = new THREE.Group(),
      right = new THREE.Group()
    left.position.x = -0.14
    right.position.x = 0.14
    c.apply(left, 'pocket-0')
    c.apply(right, 'pocket-1')
    expect(left.position.x).toBeCloseTo(-0.04)
    expect(right.position.x).toBeCloseTo(0.04)
    expect(left.position.y).toBeCloseTo(0.03)
    expect(right.position.y).toBeCloseTo(0.03)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('rebases the accepted 180 degree wheel zero without changing other adjustments', () => {
  const storage = new Map([
    [
      'nabla.xr.calibration.v3',
      JSON.stringify({
        'ar-rc-s3': { x: 4, ry: 180 },
        'hand-left': { y: 7 },
      }),
    ],
  ])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  try {
    const c = new XRCalibration(),
      wheel = new THREE.Group()
    expect(c.get('ar-rc-s3').ry).toBeCloseTo(0)
    expect(c.get('ar-rc-s3').x).toBe(4)
    expect(c.get('hand-left').y).toBe(8)
    const hand = new THREE.Group()
    c.apply(hand, 'hand-left')
    expect(hand.position.y).toBeCloseTo(0.07)
    c.apply(wheel, 'ar-rc-s3')
    expect(wheel.localToWorld(new THREE.Vector3(0, 0, 1)).z).toBeCloseTo(-1)
    c.set('ar-rc-s3', { ry: 2 })
    expect(new XRCalibration().get('ar-rc-s3').ry).toBe(2)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('retains readable adjustments when persisting a migration is denied', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => JSON.stringify({ 'hand-left': { y: 6 } }),
    setItem: () => {
      throw new Error('Storage denied')
    },
  })
  try {
    expect(new XRCalibration().get('hand-left').y).toBe(6)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('accepts the supplied hand pose as zero once and preserves the other saved objects', () => {
  const old = JSON.stringify({
    'hand-left': xrHandZero,
    'ar-rc-bike': { x: 12 },
    'pistol-0': { ry: 9 },
  })
  const storage = new Map([
    ['nabla.xr.calibration.v4', old],
    ['nabla.xr.truck-zero', 'x20-z180'],
  ])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  try {
    const calibration = new XRCalibration()
    expect(Object.values(calibration.get('hand-left'))).toEqual([0, 0, 0, 0, 0, 0])
    expect(Object.values(calibration.get('hand-right'))).toEqual([0, 0, 0, 0, 0, 0])
    expect(calibration.get('ar-rc-bike').x).toBe(12)
    expect(calibration.get('pistol-0').ry).toBe(9)
    calibration.set('hand-left', { y: 2 })
    expect(new XRCalibration().get('hand-left').y).toBe(2)
    expect(storage.get('nabla.xr.calibration.v4')).toBe(old)
  } finally {
    vi.unstubAllGlobals()
  }
})
