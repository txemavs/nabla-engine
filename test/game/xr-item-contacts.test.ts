import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { XRItemContacts } from '../../src/runtime/xr-item-contacts.js'
import { initPhysics, World, Body, Box, Vec3 } from '../../src/simulation/physics.js'

it('uses engine colliders and sounds once on impact, never repeatedly while pressed against a wall', async () => {
  await initPhysics()
  const world = new World({ gravity: new Vec3() })
  const wall = new Body({ mass: 0 })
  wall.addShape(new Box(new Vec3(0.01, 2, 2)))
  world.addBody(wall)
  world.raw.step()
  const root = new THREE.Group(),
    scene = new THREE.Scene()
  scene.add(root)
  const contacts = new XRItemContacts()
  contacts.onContact = vi.fn()
  const update = (x: number, time: number) => {
    root.position.x = x
    contacts.resolve(root, [new THREE.Vector3(x, 0, 0)], world, time)
  }
  update(-0.1, 0)
  update(0.1, 20)
  expect(root.position.x).toBeCloseTo(-0.025, 3)
  expect(contacts.onContact).toHaveBeenCalledOnce()
  for (let i = 2; i < 200; i++) update(0.1 + Math.sin(i) * 0.0002, i * 20)
  expect(contacts.onContact).toHaveBeenCalledOnce()
  // Fully separate, wait, then strike again.
  for (let i = 200; i < 240; i++) update(-0.1, i * 20)
  update(0.1, 4800)
  expect(contacts.onContact).toHaveBeenCalledTimes(2)
  world.raw.free()
})

it('ignores visual inventory, quiet touches and tracking jumps', async () => {
  await initPhysics()
  const world = new World({ gravity: new Vec3() })
  const root = new THREE.Group(),
    scene = new THREE.Scene()
  scene.add(root, new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))
  const contacts = new XRItemContacts()
  contacts.onContact = vi.fn()
  contacts.resolve(root, [new THREE.Vector3(-0.1, 0, 0)], world, 0)
  root.position.x = 0.1
  contacts.resolve(root, [new THREE.Vector3(0.1, 0, 0)], world, 20)
  expect(root.position.x).toBe(0.1)
  expect(contacts.onContact).not.toHaveBeenCalled()
  const wall = new Body({ mass: 0 })
  wall.addShape(new Box(new Vec3(0.01, 2, 2)))
  world.addBody(wall)
  world.raw.step()
  contacts.forget(root)
  contacts.resolve(root, [new THREE.Vector3(-0.026, 0, 0)], world, 40)
  root.position.x = -0.024
  contacts.resolve(root, [new THREE.Vector3(-0.024, 0, 0)], world, 60)
  expect(root.position.x).toBeCloseTo(-0.025, 3)
  expect(contacts.onContact).not.toHaveBeenCalled()
  root.position.x = 2
  contacts.resolve(root, [new THREE.Vector3(2, 0, 0)], world, 80)
  expect(root.position.x).toBe(2)
  expect(contacts.onContact).not.toHaveBeenCalled()
  world.raw.free()
})

it('drops magazines as engine rigid bodies and removes their collider when picked up', async () => {
  await initPhysics()
  const world = new World()
  const floor = new Body({ mass: 0, position: new Vec3(0, -0.1, 0) })
  floor.addShape(new Box(new Vec3(2, 0.1, 2)))
  world.addBody(floor)
  const root = new THREE.Group(),
    scene = new THREE.Scene()
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.025)))
  root.position.y = 0.7
  scene.add(root)
  const contacts = new XRItemContacts(),
    velocity = new THREE.Vector3()
  expect(contacts.drop(root, velocity, world)).toBe(true)
  expect(world.bodies).toHaveLength(2)
  for (let i = 0; i < 270; i++) {
    world.step(1 / 90)
    contacts.drop(root, velocity, world)
  }
  expect(root.position.y).toBeGreaterThan(0.005)
  expect(root.position.y).toBeLessThan(0.08)
  expect(velocity.length()).toBeLessThan(0.02)
  contacts.retainDropped([])
  expect(world.bodies).toHaveLength(1)
  contacts.dispose()
  world.raw.free()
})

it('starts a dropped object with its measured spin and translation', async () => {
  await initPhysics()
  const world = new World(),
    scene = new THREE.Scene(),
    root = new THREE.Group()
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.025)))
  root.position.y = 1
  scene.add(root)
  const contacts = new XRItemContacts(),
    velocity = new THREE.Vector3(1, 2, 0)
  contacts.drop(root, velocity, world, new THREE.Vector3(0, 0, 4))
  expect(world.bodies[0].angularVelocity.z).toBe(4)
  world.step(1 / 90)
  contacts.drop(root, velocity, world)
  expect(root.position.x).toBeGreaterThan(0)
  expect(root.position.y).toBeGreaterThan(1)
  expect(Math.abs(root.quaternion.z)).toBeGreaterThan(0.01)
  contacts.dispose()
  world.raw.free()
})

it('wakes a loose item with a shot impulse and stops targeting it after pickup', async () => {
  await initPhysics()
  const world = new World({ gravity: new Vec3() })
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.025))
  root.add(mesh)
  const contacts = new XRItemContacts()
  contacts.drop(root, new THREE.Vector3(), world)
  expect(contacts.targets).toContain(mesh)
  expect(contacts.hit(mesh, new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(1, 0, 0))).toBe(true)
  expect(world.bodies[0].velocity.x).toBeGreaterThan(0)
  expect(world.bodies[0].velocity.y).toBeGreaterThan(0)
  expect(world.bodies[0].angularVelocity.z).not.toBe(0)
  contacts.retainDropped([])
  expect(contacts.hit(mesh, new THREE.Vector3(), new THREE.Vector3(1, 0, 0))).toBe(false)
  expect(contacts.targets).toHaveLength(0)
  world.raw.free()
})

it('a dropped magazine lands on a held weapon in the same world', async () => {
  await initPhysics()
  const world = new World(),
    contacts = new XRItemContacts()
  const held = new THREE.Group(),
    loose = new THREE.Group()
  held.position.y = 0.5
  held.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2)))
  loose.position.y = 0.8
  loose.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.025)))
  contacts.trackHeld(held, world)
  contacts.drop(loose, new THREE.Vector3(), world)
  for (let i = 0; i < 180; i++) {
    contacts.trackHeld(held, world)
    world.step(1 / 90)
    contacts.drop(loose, new THREE.Vector3(), world)
  }
  expect(loose.position.y).toBeGreaterThan(0.53)
  expect(loose.position.y).toBeLessThan(0.57)
  expect(contacts.targets).not.toContain(held.children[0])
  contacts.dispose()
  world.raw.free()
})
