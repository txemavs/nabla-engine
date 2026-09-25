import { test, expect } from './studio-test.js'
import { readFileSync } from 'node:fs'
const raster = readFileSync(new URL('./fixtures/terrain-irun.lerc', import.meta.url))
test('elevation-only relief loads without GLBs and supplies ground collisions beyond prepared areas', async ({
  page,
}) => {
  await page.route('**/prepare/tiles', (r) =>
    r.fulfill({ json: { authorized: false, available: {} } }),
  )
  await page.route('**/ImageServer/tile/**', (r) =>
    r.fulfill({ body: raster, contentType: 'application/octet-stream' }),
  )
  await page.goto('/?scene=circuit')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-startup', 'ready')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const result = await page.evaluate(async (root) => {
    const module = '/planet-world.ts'
    const { PlanetWorld } = await import(module)
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const { Simulation, createEntity, createA3 } = await import(`/@fs${root}/src/index.ts`)
    const origin = { latitude: 43.32969, longitude: -1.819606, altitude: 0 }
    const world = new PlanetWorld(
      origin,
      () => {},
      () => {},
    )
    world.update([0, 100, 0], [0, 0, 0])
    await world.ensureGround([0, 100, 0])
    const height = world.groundHeight([0, 100, 0])!
    const sim = new Simulation(
      {
        version: 1,
        name: 'Relief only',
        geography: { ...origin, imagery: 'offline', planetary: true },
        entities: [
          createEntity('spawn', 'spawn', [0, height + 0.2, 0]),
          createA3('car', [4, height + 1, 0]),
        ],
      },
      { planetaryTerrain: true },
    )
    world.renderUpdate(new T.Vector3(), true, sim)
    for (let i = 0; i < 100 && !sim.preparePlanetCollisions(); i++)
      await new Promise((r) => setTimeout(r, 10))
    for (let i = 0; i < 240; i++) sim.step(1 / 60)
    const player = sim.player.position,
      car = sim.entityTransform('car').position
    world.update([8000, 100, 0], [100, 0, 0])
    await world.ensureGround([8000, 100, 0])
    const distant = world.groundHeight([8000, 100, 0]),
      native = world.activeTiles.length
    sim.dispose()
    world.dispose()
    return { height, player, car, distant, native }
  }, process.cwd())
  expect(result.height).toBeGreaterThan(5)
  expect(result.player[1]).toBeGreaterThan(result.height)
  expect(result.player[1]).toBeLessThan(result.height + 3)
  expect(result.car[1]).toBeGreaterThan(result.height - 2)
  expect(Number.isFinite(result.distant)).toBe(true)
  expect(result.native).toBe(0)
  expect(errors).toEqual([])
})
