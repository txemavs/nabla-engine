import { expect, it } from 'vitest'
import { Body, Box, Material, Vec3, World } from 'cannon-es'
import { planetCollisionChunks, type PlanetMesh } from './planet-artifact.js'
import { PlanetCollisions } from './planet-collisions.js'
const ground: PlanetMesh = {
  name: 'Ground',
  position: new Float32Array([
    -10, 0, -10, -10, 0, 10, 10, 0, 10, -10, 0, -10, 10, 0, 10, 10, 0, -10,
  ]),
  normal: new Float32Array(18),
  tint: '#888888',
  side: 0,
  metadata: { category: 'Terrain' },
}
it('uses each GLB triangle once and supports a vehicle box on the rendered surface', () => {
  const chunks = planetCollisionChunks([ground])
  expect(chunks.reduce((n, c) => n + c.triangles.length, 0)).toBe(ground.position.length)
  const world = new World({ gravity: new Vec3(0, -9.81, 0) })
  const colliders = new PlanetCollisions(world, new Material())
  colliders.setTiles([
    { id: 'WebMercatorQuad/15/1/1', pose: { position: [0, 4, 0], rotation: [0, 0, 0, 1] }, chunks },
  ])
  for (let i = 0; i < 20 && !colliders.ready; i++) colliders.update([[0, 5, 0]], true, 100)
  expect(colliders.ready).toBe(true)
  const car = new Body({
    mass: 10,
    position: new Vec3(0, 6, 0),
    shape: new Box(new Vec3(0.5, 0.5, 0.5)),
  })
  world.addBody(car)
  for (let i = 0; i < 240; i++) world.step(1 / 60)
  expect(car.position.y).toBeGreaterThan(4.45)
  expect(car.position.y).toBeLessThan(4.6)
  colliders.dispose()
  expect(world.bodies).toEqual([car])
})
it('retains old coverage until replacement collisions are ready and removes them together', () => {
  const world = new World(),
    colliders = new PlanetCollisions(world, new Material())
  const chunks = planetCollisionChunks([ground])
  const pose = {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0, 1] as [number, number, number, number],
  }
  colliders.setTiles([{ id: 'parent', pose, chunks }])
  colliders.update([[0, 1, 0]], true, 100)
  const old = [...world.bodies]
  colliders.setTiles([{ id: 'child', pose, chunks }])
  colliders.update([[0, 1, 0]], true, 100)
  expect(world.bodies.length).toBe(old.length)
  expect(world.bodies.every((b) => !old.includes(b))).toBe(true)
  colliders.update([[0, 1000, 0]], true)
  expect(world.bodies).toHaveLength(0)
})
