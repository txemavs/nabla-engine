import { test, expect } from './studio-test.js'
import { nativeMap } from './native-map.js'
test('native tiles expose HUD metadata without world labels', async ({ page }) => {
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
    world.visible = [key]
    const labels = world.navigationPlaces
    const worldLabel = !!world.root.getObjectByName('Irún')
    world.dispose()
    return { worldLabel, text: labels[0].text, altitude: labels[0].position.y }
  }, process.cwd())
  expect(result).toEqual({ worldLabel: false, text: 'Irún', altitude: 720 })
})
test('ship HUD is a transparent glass surface and switches off outside', async ({ page }) => {
  await nativeMap(page)
  await page.goto('/')
  const result = await page.evaluate(async (root) => {
    const { ShipHud } = await import(`/@fs${root}/playground/ship-hud.ts`)
    const { setNavigationPlaces } = await import(`/@fs${root}/playground/navigation-places.ts`)
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const hud = new ShipHud(),
      camera = new T.PerspectiveCamera()
    setNavigationPlaces(() => [{ id: '1', text: 'Irún', position: new T.Vector3(0, 0, -500) }])
    hud.update(camera, new T.Vector3(), 1000, { speedKmh: 120, altitude: 600 })
    const inside = hud.mesh.visible
    const canvas = hud.mesh.material.map.image
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    const drawn = pixels.some((v: number, i: number) => i % 4 === 3 && v > 0)
    hud.update(camera, new T.Vector3(), 1001, null)
    const outside = hud.mesh.visible
    hud.dispose()
    hud.mesh.geometry.dispose()
    hud.mesh.material.dispose()
    return { inside, outside, drawn }
  }, process.cwd())
  expect(result).toEqual({ inside: true, outside: false, drawn: true })
})
