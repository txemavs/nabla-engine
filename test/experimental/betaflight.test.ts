import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js'
import { initPhysics, World } from '../../src/simulation/physics.js'
import { BetaflightDrone } from '../../src/experimental/betaflight/drone.js'
import { ARBalls } from '../../src/runtime/xr-room-physics.js'
import { ARDrone } from '../../src/experimental/betaflight/ar-drone.js'
import type { DroneInput } from '../../src/experimental/betaflight/droneDef.js'

beforeAll(initPhysics)
const input = (patch: Partial<DroneInput> = {}): DroneInput => ({
  arm: true,
  mode: 'angle',
  throttle: 0.5,
  roll: 0,
  pitch: 0,
  yaw: 0,
  ...patch,
})
const tick = (world: World, drone: BetaflightDrone, command: DroneInput, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 90) {
    drone.beforeStep(command, 1 / 90)
    world.step(1 / 90)
  }
}
describe('Agency flight control in the shared Engine world', () => {
  it('hovers at neutral Angle throttle and falls when disarmed onto an Engine collider', () => {
    const world = new World()
    world.raw.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.05, 10).setTranslation(0, -0.05, 0))
    const drone = new BetaflightDrone(world, new THREE.Vector3(0, 2, 0))
    tick(world, drone, input(), 3)
    expect(drone.body.translation().y).toBeCloseTo(2, 1)
    tick(world, drone, input({ arm: false }), 3)
    expect(drone.body.translation().y).toBeGreaterThan(0)
    expect(drone.body.translation().y).toBeLessThan(0.1)
    expect(drone.snapshot.motors).toEqual([0, 0, 0, 0])
    drone.dispose()
    world.raw.free()
  })
  it('tilts under stick input, remains finite and recovers to level in Angle', () => {
    const world = new World(),
      drone = new BetaflightDrone(world, new THREE.Vector3(0, 10, 0))
    tick(world, drone, input({ pitch: 0.2, roll: -0.2 }), 0.6)
    expect(Math.abs(drone.body.rotation().x) + Math.abs(drone.body.rotation().z)).toBeGreaterThan(
      0.02,
    )
    tick(world, drone, input(), 4)
    expect(Math.abs(drone.body.rotation().x)).toBeLessThan(0.08)
    expect(Math.abs(drone.body.rotation().z)).toBeLessThan(0.08)
    expect(Object.values(drone.body.translation()).every(Number.isFinite)).toBe(true)
    drone.dispose()
    world.raw.free()
  })
  it('climbs on command and collides with a ceiling from the same world', () => {
    const world = new World()
    world.raw.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.05, 10).setTranslation(0, 3, 0))
    const drone = new BetaflightDrone(world, new THREE.Vector3(0, 2, 0))
    tick(world, drone, input({ throttle: 0.8 }), 2)
    expect(drone.body.translation().y).toBeGreaterThan(2.2)
    expect(drone.body.translation().y).toBeLessThan(3)
    drone.dispose()
    world.raw.free()
  })
  it('rejects invalid poses and disarms bad numeric input before it can corrupt physics', () => {
    const world = new World()
    expect(() => new BetaflightDrone(world, new THREE.Vector3(NaN, 1, 0))).toThrow()
    const drone = new BetaflightDrone(world, new THREE.Vector3(0, 2, 0))
    tick(world, drone, input({ throttle: NaN }), 0.2)
    expect(drone.snapshot.armed).toBe(false)
    expect(Object.values(drone.body.translation()).every(Number.isFinite)).toBe(true)
    drone.dispose()
    world.raw.free()
  })
  it('runs the controller at room substeps and disposes only its own body', async () => {
    const room = new ARBalls(new THREE.Scene())
    await room.ready
    const drone = new BetaflightDrone(room.physicsWorld!, new THREE.Vector3(0, 2, 0))
    let count = 0
    room.beforePhysicsStep = (dt) => {
      count++
      drone.beforeStep(input(), dt)
    }
    room.update(0.04, [])
    expect(count).toBe(3)
    expect(drone.body.translation().y).toBeCloseTo(2, 2)
    drone.dispose()
    room.beforePhysicsStep = undefined
    room.update(1 / 90, [])
    room.dispose()
  })
  it('maps Quest Mode 2 sticks to forward/right motion and keeps arming through menu interaction', () => {
    const world = new World(),
      scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera()
    camera.position.y = 3
    const drone = new ARDrone(scene, () => world)
    const sources = [
      { handedness: 'left', gamepad: { axes: [0, 0, 0, 0] } },
      { handedness: 'right', gamepad: { axes: [0, 0, 0.2, -0.2] } },
    ] as unknown as XRInputSource[]
    drone.spawn(camera)
    drone.setArmed(true)
    drone.readInput(sources, 1 / 90, true)
    expect(drone.armed).toBe(true)
    for (let i = 0; i < 60; i++) {
      drone.readInput(sources, 1 / 90)
      drone.beforeStep(1 / 90)
      world.step(1 / 90)
    }
    expect(drone.flight!.body.translation().x).toBeGreaterThan(0.01)
    expect(drone.flight!.body.translation().z).toBeLessThan(-0.71)
    drone.clear()
    world.raw.free()
  })
  it('disarms on tracking loss, replaces and removes its body and graphics without leaks', () => {
    const world = new World(),
      scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera()
    camera.position.y = 1.6
    const drone = new ARDrone(scene, () => world)
    expect(drone.spawn(camera)).toBe(true)
    drone.setArmed(true)
    drone.readInput([], 1 / 90)
    expect(drone.armed).toBe(false)
    drone.spawn(camera)
    expect(world.raw.bodies.len()).toBe(1)
    drone.clear()
    drone.clear()
    expect(world.raw.bodies.len()).toBe(0)
    expect(scene.children).toHaveLength(0)
    world.raw.free()
  })
})
