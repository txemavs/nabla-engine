import { beforeAll, expect, it } from 'vitest'
import * as THREE from 'three'
import { HoopScoring, type HoopBallSample } from '../../src/simulation/sports/hoop.js'
import { XRHoop } from '../../src/runtime/xr-hoop.js'
import { ARBalls } from '../../src/runtime/xr-room-physics.js'
import { initPhysics } from '../../src/simulation/physics.js'
beforeAll(initPhysics)
const ball = (y: number, x = 0, held = false, id = 1): HoopBallSample => ({
  id,
  position: { x, y, z: 0 },
  radius: 0.11,
  held,
})
it('counts full downward passages once, including a fast shot crossing between samples', () => {
  const hoop = new HoopScoring()
  hoop.sample([ball(0.5)])
  expect(hoop.sample([ball(-0.3)])).toBe(1)
  for (let i = 0; i < 20; i++) hoop.sample([ball(-0.4)])
  expect(hoop.score).toBe(1)
  hoop.sample([ball(0.5)])
  hoop.sample([ball(-0.4)])
  expect(hoop.score).toBe(2)
})
it('rejects upward passes, rim misses, held balls and removed/reused balls', () => {
  for (const samples of [
    [ball(-0.4), ball(0.4)],
    [ball(0.4, 0.2), ball(-0.4, 0.2)],
    [ball(0.4, 0, true), ball(-0.4)],
    [ball(0.1), ball(-0.4)],
  ]) {
    const hoop = new HoopScoring()
    for (const sample of samples) hoop.sample([sample])
    expect(hoop.score).toBe(0)
  }
  const hoop = new HoopScoring()
  hoop.sample([ball(0.4)])
  hoop.sample([])
  hoop.sample([ball(-0.4)])
  expect(hoop.score).toBe(0)
})
it('does not score a rim-plane bounce unless the whole ball clears below', () => {
  const hoop = new HoopScoring()
  hoop.sample([ball(0.4)])
  hoop.sample([ball(-0.02)])
  hoop.sample([ball(0.08)])
  hoop.sample([ball(-0.3)])
  expect(hoop.score).toBe(0)
})
it('uses the driving-station placement, keeps pinned position and ignores movement scoring', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.6
  const hoop = new XRHoop(scene, { scoreboard: false })
  hoop.place(camera)
  const grip = new THREE.Group(),
    buttons = [
      { pressed: false, value: 0 },
      { pressed: true, value: 1 },
    ]
  const hand = {
    grip,
    source: { handedness: 'right', gamepad: { buttons } } as unknown as XRInputSource,
  }
  grip.position.copy(hoop.pinButton.getWorldPosition(new THREE.Vector3()))
  grip.updateMatrixWorld()
  hoop.update([hand], 1 / 60)
  expect(hoop.owns(grip)).toBe(true)
  grip.position.x += 0.5
  grip.updateMatrixWorld()
  hoop.update([hand], 1 / 60)
  buttons[0].pressed = true
  buttons[0].value = 1
  hoop.update([hand], 1 / 60)
  expect(hoop.fixed).toBe(true)
  buttons[0].pressed = false
  buttons[0].value = 0
  buttons[1].pressed = false
  buttons[1].value = 0
  hoop.update([hand], 1 / 60)
  const position = hoop.root.getWorldPosition(new THREE.Vector3())
  camera.position.x = 3
  hoop.update([], 1 / 60)
  expect(hoop.root.getWorldPosition(new THREE.Vector3()).distanceTo(position)).toBeLessThan(1e-6)
  expect(hoop.collisionSurfaces).toHaveLength(3)
  hoop.dispose()
})
it('allows an Engine ball to pass through the open rim and scores from shared physics substeps', async () => {
  const scene = new THREE.Scene(),
    room = new ARBalls(scene)
  await room.ready
  const camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.6
  const hoop = new XRHoop(scene, { scoreboard: false })
  hoop.place(camera)
  const grip = new THREE.Group(),
    buttons = [
      { pressed: true, value: 1 },
      { pressed: false, value: 0 },
    ]
  grip.position.copy(hoop.pinButton.getWorldPosition(new THREE.Vector3()))
  grip.updateMatrixWorld()
  hoop.update([{ grip, source: { gamepad: { buttons } } as unknown as XRInputSource }], 1 / 90)
  expect(hoop.fixed).toBe(true)
  const point = hoop.root.localToWorld(new THREE.Vector3(0, 0.6, 0.28))
  const dropCamera = new THREE.PerspectiveCamera()
  dropCamera.position.copy(point).add(new THREE.Vector3(0, 0, 0.6))
  room.spawn(dropCamera)
  room.afterPhysicsStep = () => hoop.sampleBalls(room.ballSamples)
  for (let i = 0; i < 120; i++) room.update(1 / 90, hoop.collisionSurfaces)
  expect(hoop.score).toBe(1)
  hoop.resetScore()
  expect(hoop.score).toBe(0)
  hoop.dispose()
  room.dispose()
})
