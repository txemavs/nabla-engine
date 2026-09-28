import { expect, it } from 'vitest'
import { Body, Box, Vec3, World } from '../../src/simulation/physics.js'

it('retains a linear and angular impulse applied before the first physics step', () => {
  const world = new World({ gravity: new Vec3() })
  try {
    const body = new Body({ mass: 2, shape: new Box(new Vec3(0.5, 0.5, 0.5)) })
    world.addBody(body)
    body.applyImpulse(new Vec3(0, 0, -12), new Vec3(0.25, 0, 0))
    expect(body.velocity.z).toBeCloseTo(-6)
    expect(body.angularVelocity.y).toBeGreaterThan(0)
    world.step(1 / 60)
    expect(body.position.z).toBeLessThan(-0.09)
    expect(body.angularVelocity.y).toBeGreaterThan(0)
  } finally {
    world.raw.free()
  }
})
it.each([false, true])(
  'reports a support normal consistently with reversed insertion order: %s',
  (reverse) => {
    const world = new World()
    try {
      const ground = new Body({
        shape: new Box(new Vec3(10, 0.5, 10)),
        position: new Vec3(0, -0.5, 0),
      })
      const body = new Body({
        mass: 2,
        shape: new Box(new Vec3(0.5, 0.5, 0.5)),
        position: new Vec3(0, 1, 0),
      })
      for (const b of reverse ? [body, ground] : [ground, body]) world.addBody(b)
      for (let i = 0; i < 120; i++) world.step(1 / 60)
      const contact = world.contacts.find(
        (c) => (c.bi === body && c.bj === ground) || (c.bj === body && c.bi === ground),
      )
      expect(contact).toBeDefined()
      const normal = contact!.ni.y * (contact!.bi === body ? -1 : 1)
      expect(normal).toBeGreaterThan(0.99)
    } finally {
      world.raw.free()
    }
  },
)

it('keeps centimetre motion, point forces and scene-space raycasts accurate after rebasing far from origin', () => {
  const world = new World({ gravity: new Vec3() })
  try {
    const anchor = new Vec3(400000, 500000, -300000)
    const body = new Body({ mass: 2, shape: new Box(new Vec3(0.5, 0.5, 0.5)), position: anchor })
    world.addBody(body)
    world.rebase(anchor)
    body.applyImpulse(new Vec3(0.12, 0, 0))
    // A force through the centre must not acquire a moment from the floating origin.
    body.applyForce(new Vec3(12, 0, 0), new Vec3())
    world.step(1 / 60)
    expect(body.position.x - anchor.x).toBeGreaterThan(0.001)
    expect(body.position.x - anchor.x).toBeLessThan(0.01)
    expect(body.angularVelocity.length()).toBeLessThan(1e-6)
    let hit = false
    world.raycastAll(
      anchor.vadd(new Vec3(0, 3, 0)),
      anchor.vadd(new Vec3(0, -3, 0)),
      {},
      (result) => {
        expect(result.body).toBe(body)
        expect(result.hitPointWorld.y).toBeCloseTo(anchor.y + 0.5, 4)
        hit = true
      },
    )
    expect(hit).toBe(true)
    expect(world.intersectsCuboid(body.position, new Vec3(0.1, 0.1, 0.1))).toBe(true)
  } finally {
    world.raw.free()
  }
})
