import { test, expect } from './studio-test.js'
import { createHash } from 'node:crypto'
import {
  mapTileAt,
  mapTileBounds,
  mapTileId,
  mapTilePath,
  mapTileSample,
} from '../src/map-tiles.js'
import { groundGlb } from './planet-fixture.js'
test('native GLB stream loads global cells, exposes downloads and supplies playable collisions', async ({
  page,
}) => {
  const bytes = groundGlb(false, 'Roads'),
    empty = groundGlb(true)
  const tile = mapTileAt(43.32969, -1.819606, 15),
    anchor = mapTileSample(tile, 1, 1, 2)
  const manifest = {
    format: 'nabla-planet-tile-v1',
    generator: 'native-xyz-v2',
    id: mapTileId(tile),
    tile,
    anchor,
    bounds: mapTileBounds(tile),
    files: Object.fromEntries(
      ['terrain', 'buildings-osm'].map((name) => {
        const b = name === 'terrain' ? bytes : empty,
          h = createHash('sha256').update(b).digest('hex')
        return [
          name,
          {
            path: `${name}-${h.slice(0, 16)}.glb`,
            sha256: h,
            bytes: b.length,
            download: `${name}.glb`,
          },
        ]
      }),
    ),
  }
  const oldRequests: string[] = []
  page.on('request', (r) => {
    if (/\/prepared\/5\/|\/baked\/|xyz-flight/.test(r.url())) oldRequests.push(r.url())
  })
  await page.route('**/prepare/tiles', (route) =>
    route.fulfill({
      json: { authorized: true, accepted: 1, available: { [mapTilePath(tile)]: manifest } },
    }),
  )
  await page.route('**/prepared/z/**/*.glb', (route) =>
    route.fulfill({
      body: route.request().url().includes('buildings-osm') ? empty : bytes,
      contentType: 'model/gltf-binary',
    }),
  )
  await page.route('**/ImageServer/tile/**', (r) =>
    r.fulfill({ status: 503, body: 'Not used in this test' }),
  )
  await page.goto('/?scene=circuit')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const result = await page.evaluate(
    async ({ anchor, root }) => {
      const path = '/planet-world.ts'
      const { PlanetWorld } = await import(path)
      const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
      const { Simulation, createEntity, createA3, idleInput } = await import(
        `/@fs${root}/src/index.ts`
      )
      const stream = new PlanetWorld(
        anchor,
        () => {},
        () => {},
      )
      stream.update([0, 2, 0], [0, 0, 0])
      await stream.ensureGround([0, 2, 0])
      const sim = new Simulation(
        {
          version: 1,
          name: 'Native GLB',
          geography: { ...anchor, imagery: 'offline', planetary: true },
          entities: [createEntity('spawn', 'spawn', [-2, 1, 0]), createA3('car', [0, 1, 0])],
        },
        { planetaryTerrain: true },
      )
      stream.renderUpdate(new T.Vector3(), true, sim)
      for (let i = 0; i < 100 && !sim.preparePlanetCollisions(); i++)
        await new Promise((r) => setTimeout(r, 10))
      for (let i = 0; i < 180; i++) sim.step(1 / 60)
      const height = stream.groundHeight([0, 2, 0]),
        player = sim.player.position
      const entered = sim.interact()
      sim.setInput({ ...idleInput(), forward: 1 })
      for (let i = 0; i < 180; i++) sim.step(1 / 60)
      const car = sim.entityTransform('car').position
      const panel = document.createElement('div')
      const selected = stream.inspect(
        new T.Raycaster(new T.Vector3(0, 10, 0), new T.Vector3(0, -1, 0)),
        panel,
      )
      const links = panel.querySelectorAll('a').length
      const count = stream.root.children.filter((c: any) => c.userData.planetTile).length
      const charts = stream.chartTiles.length
      stream.dispose()
      sim.dispose()
      return { height, player, selected, links, count, entered, car, charts }
    },
    { anchor, root: process.cwd() },
  )
  expect(result.charts).toBe(1)
  expect(result.height).toBeCloseTo(0, 3)
  expect(result.player[1]).toBeGreaterThan(0)
  expect(result.player[1]).toBeLessThan(3)
  expect(result.entered).toContain('Conduciendo')
  expect(result.car[1]).toBeGreaterThan(0)
  expect(result.car[1]).toBeLessThan(3)
  expect(Math.hypot(result.car[0], result.car[2])).toBeGreaterThan(1)
  expect(result.selected).toBe(true)
  expect(result.links).toBe(2)
  expect(result.count).toBe(1)
  expect(oldRequests).toEqual([])
  expect(errors).toEqual([])
})
