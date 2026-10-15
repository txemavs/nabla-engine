import { beforeAll, expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js'
import { initPhysics, World } from '../../src/simulation/physics.js'
import { XRScaledBodyContacts } from '../../src/runtime/xr-scaled-body-contacts.js'
import type { EntityCollisionPart } from '../../src/simulation/simulation.js'
import { Simulation } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
beforeAll(initPhysics)
const part = (x: number): EntityCollisionPart => ({
  key: 'car',
  shape: { kind: 'box', halfExtents: [0.1, 0.15, 0.1] },
  transform: { position: [x, 0.15, 0], rotation: [0, 0, 0, 1] },
  friction: 0.7,
  restitution: 0.05,
})
it.each(['ball', 'magazine', 'cartridge'])(
  'uses shared Rapier contacts to push a loose %s',
  (kind) => {
    const world = new World(),
      contacts = new XRScaledBodyContacts(() => world)
    world.raw.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.05, 10).setTranslation(0, -0.05, 0))
    const body = world.raw.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.11, 0).setCcdEnabled(true),
    )
    const shape =
      kind === 'ball'
        ? RAPIER.ColliderDesc.ball(0.11)
        : RAPIER.ColliderDesc.cuboid(0.015, kind === 'magazine' ? 0.07 : 0.015, 0.02)
    world.raw.createCollider(shape.setMass(0.1).setFriction(0.5), body)
    contacts.sync([part(-0.6)], 1, 1 / 90)
    for (let i = 0; i < 100; i++) {
      contacts.sync([part(-0.6 + i * 0.012)], 1, 1 / 90)
      contacts.beforeStep(1 / 90)
      world.step(1 / 90)
    }
    expect(body.translation().x).toBeGreaterThan(0.15)
    contacts.clear()
    expect(world.raw.bodies.len()).toBe(1)
    world.raw.free()
  },
)
it('exports actual Engine chassis parts and tyres, and maps the same shapes at toy scale', () => {
  const sim = new Simulation(
    {
      version: 1,
      name: 'test',
      entities: [createEntity('spawn', 'spawn', [0, 1, 0]), presetVehicle('car', 'car')],
    },
    { ignition: false, vehicleDamage: false },
  )
  const parts = sim.entityCollisionParts('car')
  expect(parts.some((p) => p.shape.kind === 'box')).toBe(true)
  expect(parts.filter((p) => p.key.startsWith('wheel'))).toHaveLength(4)
  const world = new World(),
    contacts = new XRScaledBodyContacts(() => world)
  contacts.sync(parts, 0.01, 1 / 60)
  contacts.beforeStep(1 / 90)
  world.step(1 / 90)
  expect(world.raw.bodies.len()).toBe(parts.length)
  let first: RAPIER.Collider | undefined
  world.raw.colliders.forEach((c) => {
    first ??= c
  })
  const source = parts[0].shape
  if (source.kind === 'box')
    expect(first!.halfExtents().x).toBeCloseTo(source.halfExtents[0] * 0.01, 5)
  contacts.clear()
  expect(world.raw.bodies.len()).toBe(0)
  sim.dispose()
  world.raw.free()
})

it('treats a recovery teleport as placement, without sweeping a car through nearby props', () => {
  const world = new World(),
    contacts = new XRScaledBodyContacts(() => world)
  const ball = world.raw.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.15, 0))
  world.raw.createCollider(RAPIER.ColliderDesc.ball(0.11).setMass(0.1), ball)
  contacts.sync([part(-0.6)], 1, 1 / 90)
  contacts.sync([part(5)], 1, 1 / 90)
  contacts.beforeStep(1 / 90)
  world.step(1 / 90)
  expect(Math.abs(ball.translation().x)).toBeLessThan(0.001)
  contacts.clear()
  world.raw.free()
})
