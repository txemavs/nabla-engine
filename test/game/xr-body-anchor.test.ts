import { expect, it } from 'vitest'
import * as THREE from 'three'
import { XRBodyAnchor } from '../../src/runtime/xr-body-anchor.js'

it('allows neck rotation while following position, then eases the torso through larger turns', () => {
  const anchor = new XRBodyAnchor(),
    body = new THREE.Group(),
    camera = new THREE.PerspectiveCamera()
  anchor.update(body, camera, 1 / 90)
  camera.rotation.y = THREE.MathUtils.degToRad(30)
  camera.position.set(1, 1.6, 2)
  for (let i = 0; i < 90; i++) anchor.update(body, camera, 1 / 90)
  expect(body.rotation.y).toBe(0)
  expect(body.position.toArray()).toEqual([1, 1.6, 2])
  camera.rotation.y = Math.PI / 2
  anchor.update(body, camera, 1 / 90)
  expect(body.rotation.y).toBeGreaterThan(0)
  expect(body.rotation.y).toBeLessThanOrEqual(Math.PI / 270)
  for (let i = 0; i < 270; i++) anchor.update(body, camera, 1 / 90)
  expect(THREE.MathUtils.radToDeg(body.rotation.y)).toBeCloseTo(55, 2)
  camera.rotation.set(-Math.PI / 2, 0, 0)
  const previous = body.rotation.y
  anchor.update(body, camera, 1 / 90)
  expect(body.rotation.y).toBe(previous)
  expect(body.rotation.x).toBe(0)
  expect(body.rotation.z).toBe(0)
})

it('crosses the yaw seam by the shortest path and resets on a new session', () => {
  const anchor = new XRBodyAnchor(),
    body = new THREE.Group(),
    camera = new THREE.PerspectiveCamera()
  camera.rotation.y = THREE.MathUtils.degToRad(179)
  anchor.update(body, camera, 1 / 72)
  camera.rotation.y = THREE.MathUtils.degToRad(-179)
  anchor.update(body, camera, 1 / 72)
  expect(THREE.MathUtils.radToDeg(body.rotation.y)).toBeCloseTo(179)
  anchor.reset()
  camera.rotation.y = 0
  anchor.update(body, camera, 1 / 72)
  expect(body.rotation.y).toBeCloseTo(0)
})
