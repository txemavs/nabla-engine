import { test, expect } from './studio-test.js'
import { nativeMap } from './native-map.js'
test('native tiles render lightweight city labels and dispose them on eviction', async ({
  page,
}) => {
  await nativeMap(page)
  await page.goto('/')
  const result = await page.evaluate(async (root) => {
    const { PlanetWorld } = await import(`/@fs${root}/playground/planet-world.ts`)
    const { mapTileAt, mapTileId, mapTileSample } = await import(`/@fs${root}/src/map-tiles.ts`)
    const tile = mapTileAt(43.33, -1.82, 15)
    const world = new PlanetWorld(
      mapTileSample(tile, 1, 1, 2),
      () => {},
      () => {},
    )
    const key = mapTileId(tile)
    const manifest = {
      tile,
      anchor: mapTileSample(tile, 1, 1, 2),
      files: { terrain: { sha256: 'test' } },
      places: [{ id: 'node/1', text: 'Irún', category: 'city', position: [0, 620, 0] }],
    }
    const payload = { meshes: [], chunks: [], vegetation: [], bytes: 0, buildings: false }
    world.install(key, manifest, payload)
    const label = world.root.getObjectByName('Irún')
    let released = 0
    label.material.map.addEventListener('dispose', () => released++)
    label.material.addEventListener('dispose', () => released++)
    const position = label.position.toArray()
    const sprite = label.isSprite && !label.material.sizeAttenuation
    world.dispose()
    return { position, sprite, released }
  }, process.cwd())
  expect(result).toEqual({ position: [0, 620, 0], sprite: true, released: 2 })
})
