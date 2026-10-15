import { expect, it } from 'vitest'
import * as T from 'three'
import { ARBalls } from '../../src/runtime/xr-room-physics.js'
it('holds a ball off centre, passes between hands without snapping and throws with spin', async () => {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera()
  camera.position.y = 1.6
  const balls = new ARBalls(scene)
  await balls.ready
  balls.spawn(camera)
  const mesh = balls.targets[0],
    start = mesh.position.clone()
  const grip = new T.Group()
  grip.position.copy(start).add(new T.Vector3(0.08, 0, 0))
  scene.add(grip)
  const buttons = [{ pressed: false }, { pressed: true }]
  const hand = { grip, source: { gamepad: { buttons } } as unknown as XRInputSource }
  balls.grab([hand], 1 / 90)
  balls.update(1 / 90, [])
  expect(mesh.position.distanceTo(start)).toBeLessThan(1e-6)
  for (let i = 0; i < 20; i++) {
    grip.position.x += 0.01
    grip.rotateY(0.03)
    balls.grab([hand], 1 / 90)
    balls.update(1 / 90, [])
  }
  buttons[1].pressed = false
  balls.grab([hand], 1 / 90)
  let angular = 0,
    vx = 0
  balls.physicsWorld!.raw.forEachRigidBody((body) => {
    angular = body.angvel().y
    vx = body.linvel().x
  })
  expect(angular).toBeGreaterThan(2)
  expect(vx).toBeGreaterThan(0.5)
  const release = mesh.position.clone()
  balls.update(1 / 90, [])
  expect(mesh.position.x).toBeGreaterThan(release.x)
  expect(mesh.position.y).toBeLessThan(release.y)
  balls.dispose()
})
