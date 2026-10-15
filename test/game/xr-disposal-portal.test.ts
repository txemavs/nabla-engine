import { expect, it } from 'vitest'
import * as T from 'three'
import { XRDisposalPortal } from '../../src/runtime/xr-disposal-portal.js'
import { ARBalls } from '../../src/runtime/xr-room-physics.js'

it('sweeps only into the back of the finite, transformed panel', async () => {
  const parent = new T.Group(),
    panel = new T.Group()
  parent.add(panel)
  parent.position.set(2, 1, -3)
  parent.rotation.y = 0.8
  parent.scale.setScalar(0.65)
  const portal = new XRDisposalPortal(panel, 2, 1.25)
  await portal.initialized
  const p = (x: number, z: number) => panel.localToWorld(new T.Vector3(x, 0, z))
  expect(portal.accepts(p(0, -2), p(0, 2), 0.1)).toBe(true)
  expect(portal.accepts(p(0, 2), p(0, -2), 0.1)).toBe(false)
  expect(portal.accepts(p(3, -2), p(3, 2), 0.1)).toBe(false)
  expect(portal.accepts(p(0, -2), p(0, -3), 0.1)).toBe(false)
  parent.visible = false
  expect(portal.accepts(p(0, -2), p(0, 2), 0.1)).toBe(false)
})

it('balls bounce at the front and are removed with their physics body at the back', async () => {
  const scene = new T.Scene(),
    panel = new T.Mesh(new T.BoxGeometry(2, 1.25, 0.03))
  panel.position.set(0, 1.6, -1.1)
  panel.scale.setScalar(0.65)
  panel.userData.xrSupplementalCollision = true
  scene.add(panel)
  const portal = new XRDisposalPortal(panel, 2, 1.25)
  await portal.initialized
  const balls = new ARBalls(scene),
    camera = new T.PerspectiveCamera()
  camera.position.set(0, 1.6, 0)
  await balls.ready
  balls.disposalTest = portal.accepts
  balls.spawn(camera)
  balls.hit(balls.targets[0], balls.targets[0].position, new T.Vector3(0, 0, -1))
  let bounced = false,
    last = balls.targets[0].position.z
  for (let i = 0; i < 35; i++) {
    balls.update(1 / 90, [panel])
    expect(balls.targets).toHaveLength(1)
    if (balls.targets[0].position.z > last + 0.001) bounced = true
    last = balls.targets[0].position.z
  }
  expect(bounced).toBe(true)
  balls.reset()
  camera.position.z = -1.1
  balls.spawn(camera)
  balls.hit(balls.targets[0], balls.targets[0].position, new T.Vector3(0, 0, 1))
  for (let i = 0; i < 35; i++) balls.update(1 / 90, [panel])
  expect(balls.targets).toHaveLength(0)
  expect(balls.physicsWorld!.raw.bodies.len()).toBe(0)
  balls.dispose()
})
