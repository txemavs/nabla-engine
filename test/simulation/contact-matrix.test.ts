import { expect, it } from 'vitest'
import { Body, Sphere, World, Vec3 } from '../../src/simulation/physics.js'
import { SparseContactMatrix } from '../../src/math/contact/matrix.js'

it('uses stable body identities through streaming index changes without a quadratic allocation', () => {
  const matrix = new SparseContactMatrix(),
    a = new Body(),
    b = new Body(),
    c = new Body()
  a.index = 0
  b.index = 1
  c.index = 2
  matrix.setNumObjects(18000)
  matrix.set(a, b, true)
  expect(matrix.get(b, a)).toBe(1)
  b.index = 0
  c.index = 1
  expect(matrix.get(a, b)).toBe(1)
  expect(matrix.get(a, c)).toBe(0)
  expect(matrix.matrix).toHaveLength(0)
  matrix.set(b, a, false)
  expect(matrix.get(a, b)).toBe(0)
  matrix.set(a, c, true)
  matrix.reset()
  expect(matrix.get(a, c)).toBe(0)
})

it('drops a dynamic body onto a static one', () => {
  const world = new World({ gravity: new Vec3(0, -10, 0) })
  const floor = new Body({ mass: 0, shape: new Sphere(100), position: new Vec3(0, -100, 0) })
  const ball = new Body({ mass: 1, shape: new Sphere(1), position: new Vec3(0, 3, 0) })
  world.addBody(floor)
  world.addBody(ball)
  for (let i = 0; i < 180; i++) world.step(1 / 60)
  expect(ball.position.y).toBeLessThan(2)
  expect(ball.position.y).toBeGreaterThan(0.5)
})
