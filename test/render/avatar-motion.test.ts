/** On-foot avatar smoothing (like the cameras) and the thrown rider's tumble pose. */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  AvatarFollow,
  AvatarTransfer,
  EjectionTumble,
} from '../../src/render/entity/avatar-motion.js'
import { startEjection, type RiderEjection } from '../../src/simulation/rider-ejection.js'
import { ejectionDefaults } from '../../src/config/simulation.js'

const dt = 1 / 60

describe('AvatarTransfer', () => {
  it('blends getting into and out of a moving vehicle without a pose jump', () => {
    const transfer = new AvatarTransfer(),
      avatar = new THREE.Group(),
      head = new THREE.Group()
    transfer.update(avatar, head, null, dt)
    avatar.position.set(2, 1, 0)
    head.scale.setScalar(0.7)
    transfer.update(avatar, head, 'bike', dt)
    expect(avatar.position.x).toBeLessThan(0.01)
    expect(head.scale.x).toBeGreaterThan(0.99)
    for (let i = 1; i <= 50; i++) {
      avatar.position.set(2 + i * dt, 1, 0)
      head.scale.setScalar(0.7)
      transfer.update(avatar, head, 'bike', dt)
    }
    expect(avatar.position.x).toBeCloseTo(2 + 50 * dt)
    const previous = avatar.position.clone()
    avatar.position.add(new THREE.Vector3(1, -1, 0))
    head.scale.setScalar(0.825)
    transfer.update(avatar, head, null, dt)
    expect(avatar.position.distanceTo(previous)).toBeLessThan(0.01)
  })

  it('keeps crash ejections and teleports immediate', () => {
    const transfer = new AvatarTransfer(),
      avatar = new THREE.Group(),
      head = new THREE.Group()
    transfer.update(avatar, head, 'bike', dt)
    avatar.position.set(1, 0, 0)
    transfer.update(avatar, head, null, dt, true)
    expect(avatar.position.x).toBe(1)
    avatar.position.set(100, 0, 0)
    transfer.update(avatar, head, 'car', dt)
    expect(avatar.position.x).toBe(100)
  })
})

describe('AvatarFollow', () => {
  it('has no lag at steady walking speed and heading rate', () => {
    const f = new AvatarFollow()
    for (let i = 0; i <= 120; i++)
      f.update(new THREE.Vector3(0, 1, -4.2 * i * dt), 0.8 * i * dt, dt)
    expect(f.position.distanceTo(new THREE.Vector3(0, 1, -4.2 * 120 * dt))).toBeLessThan(0.01)
    expect(Math.abs(f.heading - Math.atan2(Math.sin(0.8 * 2), Math.cos(0.8 * 2)))).toBeLessThan(
      0.01,
    )
  })

  it('smooths jitter and steps instead of copying them', () => {
    const f = new AvatarFollow()
    f.update(new THREE.Vector3(0, 1, 0), 0, dt)
    f.update(new THREE.Vector3(0, 1.3, 0), 0.6, dt)
    expect(f.position.y).toBeLessThan(1.1)
    expect(f.heading).toBeLessThan(0.2)
    for (let i = 0; i < 60; i++) f.update(new THREE.Vector3(0, 1.3, 0), 0.6, dt)
    expect(f.position.y).toBeCloseTo(1.3, 2)
    expect(f.heading).toBeCloseTo(0.6, 2)
  })

  it('takes the short way round across ±π', () => {
    const f = new AvatarFollow()
    f.update(new THREE.Vector3(), Math.PI - 0.05, dt)
    for (let i = 0; i < 60; i++) f.update(new THREE.Vector3(), -Math.PI + 0.05, dt)
    expect(Math.abs(Math.abs(f.heading) - (Math.PI - 0.05))).toBeLessThan(0.01)
  })

  it('snaps on a teleport', () => {
    const f = new AvatarFollow()
    f.update(new THREE.Vector3(), 0, dt)
    f.update(new THREE.Vector3(50, 0, 0), 1, dt)
    expect(f.position.x).toBe(50)
    expect(f.heading).toBe(1)
  })
})

describe('EjectionTumble', () => {
  const frame = (model: THREE.Object3D) => {
    model.quaternion.identity()
    model.position.set(0, 0, 0)
    model.scale.setScalar(1)
  }

  it('rolls with the travel, squashes on the hit and turns upright while getting up', () => {
    const model = new THREE.Group()
    const tumble = new EjectionTumble()
    let e: RiderEjection = startEjection('bike', 40)
    const fast = new THREE.Vector3(0, 0, -20)
    for (let i = 0; i < 10; i++) {
      frame(model)
      tumble.update(model, e, fast, dt)
    }
    // Forward roll: about −X, the face (−Z) going down.
    const face = new THREE.Vector3(0, 0, -1).applyQuaternion(model.quaternion)
    expect(face.y).toBeLessThan(-0.5)
    e = { ...e, phase: 'down', phaseElapsed: 0, hit: 15 }
    frame(model)
    tumble.update(model, e, fast, dt)
    expect(model.scale.y).toBeLessThan(0.8)
    expect(model.scale.x).toBeGreaterThan(1.1)
    for (let i = 0; i < 60; i++) {
      frame(model)
      tumble.update(model, e, new THREE.Vector3(), dt)
    }
    expect(model.scale.y).toBeCloseTo(1, 2)
    const lying = model.quaternion.clone()
    expect(lying.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.3)
    e = { ...e, phase: 'rising', phaseElapsed: 0 }
    frame(model)
    tumble.update(model, e, new THREE.Vector3(), dt)
    expect(model.quaternion.angleTo(lying)).toBeLessThan(0.05)
    e = { ...e, phaseElapsed: ejectionDefaults.riseSeconds }
    frame(model)
    tumble.update(model, e, new THREE.Vector3(), dt)
    expect(model.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6)
    frame(model)
    expect(tumble.update(model, null, new THREE.Vector3(), dt)).toBe(false)
    expect(tumble.active).toBe(false)
  })

  it('lowers a walker to the ground while down and back up while rising', () => {
    const model = new THREE.Group()
    const tumble = new EjectionTumble()
    let e: RiderEjection = { ...startEjection('bike', 40), phase: 'down', hit: 5 }
    for (let i = 0; i < 120; i++) {
      frame(model)
      tumble.update(model, e, new THREE.Vector3(), dt, 0.7)
    }
    expect(model.position.y).toBeCloseTo(-0.7, 2)
    e = { ...e, phase: 'rising', phaseElapsed: ejectionDefaults.riseSeconds }
    frame(model)
    tumble.update(model, e, new THREE.Vector3(), dt, 0.7)
    expect(model.position.y).toBeCloseTo(0, 5)
  })
})
