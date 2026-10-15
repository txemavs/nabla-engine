import { expect, it } from 'vitest'
import * as T from 'three'
import { XRObjectGrab } from '../../src/runtime/xr-object-grab.js'

it('preserves the contact offset and scale, and rotates a one-handed object about its contact', () => {
  const object = new T.Group(),
    hand = new T.Group(),
    grab = new XRObjectGrab()
  object.position.set(0.2, 0, 0)
  object.scale.setScalar(0.01)
  grab.update(object, [hand], 1 / 90)
  expect(object.position.x).toBe(0.2)
  hand.rotation.z = Math.PI / 2
  grab.update(object, [hand], 1 / 90)
  expect(object.position.x).toBeCloseTo(0)
  expect(object.position.y).toBeCloseTo(0.2)
  expect(object.scale.x).toBe(0.01)
})
it('rebases both-hand grabs, release of either hand and handoff without a pose jump', () => {
  const object = new T.Group(),
    left = new T.Group(),
    right = new T.Group(),
    grab = new XRObjectGrab()
  left.position.x = -0.2
  right.position.x = 0.2
  object.position.y = 0.1
  grab.update(object, [left], 1 / 90)
  const p = object.position.clone(),
    q = object.quaternion.clone()
  grab.update(object, [left, right], 1 / 90)
  expect(object.position.distanceTo(p)).toBeLessThan(1e-10)
  expect(object.quaternion.angleTo(q)).toBeLessThan(1e-7)
  right.position.set(0, 0.2, 0)
  left.position.set(0, -0.2, 0)
  grab.update(object, [left, right], 1 / 90)
  expect(object.position.x).toBeCloseTo(-0.1)
  const turned = object.quaternion.clone(),
    at = object.position.clone()
  grab.update(object, [right], 1 / 90)
  expect(object.position.distanceTo(at)).toBeLessThan(1e-10)
  expect(object.quaternion.angleTo(turned)).toBeLessThan(1e-7)
  right.position.z += 0.3
  grab.update(object, [right], 1 / 90)
  expect(object.position.z).toBeCloseTo(0.3)
  expect(grab.update(object, [], 1 / 90)).toBe(true)
  expect(object.quaternion.angleTo(turned)).toBeLessThan(1e-7)
})
it('releases measured translation and spin, using the last controller pose on the release frame', () => {
  const object = new T.Group(),
    hand = new T.Group(),
    grab = new XRObjectGrab()
  grab.update(object, [hand], 1 / 90)
  for (let i = 1; i <= 20; i++) {
    hand.position.x = (i / 90) * 2
    hand.rotation.y = (i / 90) * 3
    grab.update(object, [hand], 1 / 90)
  }
  hand.position.x = (21 / 90) * 2
  hand.rotation.y = (21 / 90) * 3
  grab.update(object, [], 1 / 90)
  expect(grab.velocity.x).toBeCloseTo(2, 8)
  expect(grab.angularVelocity.y).toBeCloseTo(3, 8)
  expect(object.position.x).toBeCloseTo((21 / 90) * 2, 8)
})
it('keeps coincident hands finite and clears throw history after a tracking gap', () => {
  const object = new T.Group(),
    a = new T.Group(),
    b = new T.Group(),
    grab = new XRObjectGrab()
  grab.update(object, [a, b], 1 / 90)
  for (let i = 0; i < 100; i++) grab.update(object, [a, b], 1 / 90)
  expect(object.quaternion.toArray().every(Number.isFinite)).toBe(true)
  a.position.x = 4
  grab.update(object, [], 0.5)
  expect(grab.velocity.length()).toBe(0)
  expect(grab.angularVelocity.length()).toBe(0)
})

it('does not turn a floating origin shift into a throw impulse', () => {
  const object = new T.Group(),
    hand = new T.Group(),
    grab = new XRObjectGrab()
  grab.update(object, [hand], 1 / 90)
  for (let i = 1; i <= 10; i++) {
    hand.position.x = i / 90
    grab.update(object, [hand], 1 / 90)
  }
  const shift = new T.Vector3(-100, 0, 0)
  grab.shiftOrigin(shift)
  hand.position.add(shift)
  hand.position.x += 1 / 90
  grab.update(object, [], 1 / 90)
  expect(grab.velocity.x).toBeCloseTo(1, 8)
})
