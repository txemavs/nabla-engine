import { expect, it } from 'vitest'
import { Body, Sphere, World, Vec3 } from '../../src/simulation/physics.js'

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
