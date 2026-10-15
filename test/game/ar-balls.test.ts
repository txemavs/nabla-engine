import { expect, it } from 'vitest'
import * as THREE from 'three'
import { ARBalls } from '../../src/runtime/xr-room-physics.js'

it('bounces off scanned surfaces, responds to shot impulses and caps live balls', async () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 1.6, 0)
  const balls = new ARBalls(scene)
  await balls.ready
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.5
  scene.add(floor)
  balls.spawn(camera)
  let lastY = 1.6,
    bounced = false
  for (let i = 0; i < 180; i++) {
    balls.update(1 / 90, [floor])
    const y = balls.targets[0].position.y
    if (y > lastY + 0.002) bounced = true
    expect(y).toBeGreaterThan(0.55)
    lastY = y
  }
  expect(bounced).toBe(true)
  const ball = balls.targets[0],
    startX = ball.position.x
  balls.hit(ball, ball.position.clone(), new THREE.Vector3(1, 0, 0))
  balls.update(1 / 90, [floor])
  expect(ball.position.x).toBeGreaterThan(startX)
  for (let i = 0; i < 15; i++) balls.spawn(camera)
  expect(balls.targets).toHaveLength(12)
  balls.reset()
  expect(balls.targets).toHaveLength(0)
  balls.dispose()
})

it('holds one ball per hand and throws it on grip release', async () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.6
  const balls = new ARBalls(scene)
  await balls.ready
  balls.spawn(camera)
  const grip = new THREE.Group()
  grip.position.copy(balls.targets[0].position)
  scene.add(grip)
  const buttons = [{ pressed: false }, { pressed: true }]
  const hand = { grip, source: { gamepad: { buttons } } as unknown as XRInputSource }
  balls.grab([hand], 1 / 90)
  expect(balls.owns(grip)).toBe(true)
  grip.position.x += 0.04
  balls.grab([hand], 1 / 90)
  balls.update(1 / 90, [])
  expect(balls.targets[0].position.x).toBeCloseTo(grip.position.x)
  buttons[1].pressed = false
  balls.grab([hand], 1 / 90)
  expect(balls.owns(grip)).toBe(false)
  const x = balls.targets[0].position.x
  balls.update(1 / 90, [])
  expect(balls.targets[0].position.x).toBeGreaterThan(x)
  balls.spawn(camera)
  expect(balls.targets[0].material).not.toBe(balls.targets[1].material)
  balls.dispose()
})
