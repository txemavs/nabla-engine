import { beforeAll, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js'
import { initPhysics, World } from '../../src/simulation/physics.js'
import { BowDraw } from '../../src/simulation/weapons/bow.js'
import { XRBow } from '../../src/runtime/xr-bow.js'
import type { GrabHand } from '../../src/runtime/xr-grab.js'
beforeAll(initPhysics)
it('turns draw energy into arrow speed, with minimum draw and validated limits', () => {
  const draw = new BowDraw()
  expect(draw.release()).toBe(0)
  draw.start()
  draw.pull(0.02)
  expect(draw.release()).toBe(0)
  draw.start()
  draw.pull(0.2)
  const half = draw.release()
  draw.start()
  draw.pull(0.4)
  expect(draw.release()).toBeCloseTo(half * 2)
  draw.start()
  draw.pull(Infinity)
  expect(draw.release()).toBe(0)
  draw.start()
  draw.pull(100)
  expect(draw.release()).toBeLessThanOrEqual(draw.spec.maxSpeed)
  expect(() => new BowDraw({ arrowMass: 0 })).toThrow()
})
function setup() {
  const scene = new THREE.Scene(),
    world = new World(),
    camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.6
  const bow = new XRBow(scene, () => world)
  bow.spawn(camera)
  const hand = (side: 'left' | 'right'): GrabHand => ({
    grip: new THREE.Group(),
    mount: new THREE.Group(),
    source: {
      handedness: side,
      gamepad: {
        buttons: [
          { pressed: false, value: 0 },
          { pressed: false, value: 0 },
        ],
      },
    } as unknown as XRInputSource,
  })
  const left = hand('left'),
    right = hand('right')
  const pressed = (h: GrabHand, value: boolean) => {
    ;(h.source!.gamepad!.buttons[1] as { pressed: boolean; value: number }).pressed = value
    ;(h.source!.gamepad!.buttons[1] as { pressed: boolean; value: number }).value = value ? 1 : 0
  }
  left.grip.position.copy(bow.root!.position)
  right.grip.position.copy(bow.root!.localToWorld(new THREE.Vector3(0, 0, 0.155)))
  left.grip.updateMatrixWorld()
  right.grip.updateMatrixWorld()
  pressed(left, true)
  bow.interact([left, right], 1 / 90)
  pressed(right, true)
  bow.interact([left, right], 1 / 90)
  right.grip.position.z += 0.4
  right.grip.updateMatrixWorld()
  bow.interact([left, right], 1 / 90)
  return { bow, world, left, right, pressed }
}
it('fires only on intentional string release and sticks at an Engine wall contact', () => {
  const { bow, world, left, right, pressed } = setup()
  const hit = vi.fn()
  bow.onHit = hit
  expect(bow.draw.distance).toBeCloseTo(0.4)
  pressed(right, false)
  bow.interact([left, right], 1 / 90)
  expect(bow.arrowCount).toBe(1)
  expect(world.raw.bodies.len()).toBe(2)
  world.raw.createCollider(RAPIER.ColliderDesc.cuboid(2, 2, 0.05).setTranslation(0, 1, -2))
  for (let i = 0; i < 90; i++) {
    world.step(1 / 90)
    bow.sync(1 / 90)
  }
  expect(hit).toHaveBeenCalledOnce()
  expect(hit.mock.calls[0][0].z).toBeCloseTo(-1.95, 1)
  bow.dispose()
  expect(world.raw.bodies.len()).toBe(0)
  world.raw.free()
})
it('cancels rather than firing when tracking is lost or the bow is released', () => {
  for (const lost of ['string', 'bow']) {
    const { bow, world, left, right, pressed } = setup()
    if (lost === 'string') bow.interact([left], 1 / 90)
    else {
      pressed(left, false)
      bow.interact([left, right], 1 / 90)
    }
    expect(bow.arrowCount).toBe(0)
    expect(bow.draw.drawing).toBe(false)
    bow.dispose()
    world.raw.free()
  }
})
it('uses either hand to carry the bow and releases it into shared gravity without a jump', () => {
  const { bow, world, left, right, pressed } = setup()
  pressed(right, false)
  bow.interact([left, right], 1 / 90)
  const before = bow.root!.position.clone()
  pressed(left, false)
  bow.interact([left, right], 1 / 90)
  expect(bow.root!.position.distanceTo(before)).toBeLessThan(1e-6)
  for (let i = 0; i < 20; i++) {
    world.step(1 / 90)
    bow.sync(1 / 90)
  }
  expect(bow.root!.position.y).toBeLessThan(before.y - 0.1)
  bow.clear()
  bow.clear()
  expect(world.raw.bodies.len()).toBe(0)
  bow.dispose()
  world.raw.free()
})
