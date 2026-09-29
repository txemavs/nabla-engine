import { test, expect } from './studio-test.js'

test('roof projection does not intercept building selection and the selection is a detached surface', async ({
  page,
}) => {
  await page.route('**/building-preview', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/building-preview')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { PlanetWorld } = await import(`/@fs${root}/src/render/planet/world.ts`)
    const world = new PlanetWorld(
      { latitude: 0, longitude: 0, altitude: 0 },
      () => {},
      () => {},
    )
    const tile = new T.Group()
    tile.userData.planetTile = {
      key: 'test',
      directory: '/tiles/test',
      manifest: {
        anchor: { latitude: 0, longitude: 0 },
        files: {
          terrain: { path: 'terrain.glb', bytes: 0 },
          'buildings-osm': { path: 'buildings.glb', bytes: 0 },
        },
      },
    }
    world.root.add(tile)
    const first = new T.BoxGeometry(2, 4, 2).toNonIndexed()
    const second = new T.BoxGeometry(2, 4, 2).toNonIndexed().translate(6, 0, 0)
    const positions = new Float32Array([
      ...first.attributes.position.array,
      ...second.attributes.position.array,
    ])
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3))
    const material = new T.MeshBasicMaterial()
    const buildings = new T.Mesh(geometry, material)
    buildings.userData = {
      category: 'Buildings',
      parts: [
        { start: 0, count: 36, id: 'first' },
        { start: 36, count: 36, id: 'second' },
      ],
    }
    tile.add(buildings)
    const roof = new T.Mesh(new T.PlaneGeometry(2, 2), material)
    roof.rotation.x = -Math.PI / 2
    roof.position.y = 2.15
    roof.userData.drape = 'roofs'
    tile.add(roof)
    const host = document.createElement('div')
    const ray = new T.Raycaster(new T.Vector3(0, 10, 0), new T.Vector3(0, -1, 0))
    const selected = world.inspect(ray, host)
    const roofTitle = host.querySelector('h3')?.textContent
    const surface = world.selectedSurface
    const detached = surface.parent === null
    const range = { ...surface.geometry.drawRange }
    const wireframe = surface.material.wireframe
    // Projection remains visible, and no extra mesh was attached to the building.
    const originals = roof.visible && buildings.children.length === 0
    ray.set(new T.Vector3(0, 0, 10), new T.Vector3(0, 0, -1))
    const facade = world.inspect(ray, host)
    const facadeTitle = host.querySelector('h3')?.textContent
    tile.position.set(-1000, 4, 2)
    world.root.updateMatrixWorld(true)
    const follows = world.selectedSurface.matrix.elements[12] === -1000
    world.clearSelection()
    const cleared = world.selectedSurface === undefined
    world.dispose()
    first.dispose()
    second.dispose()
    geometry.dispose()
    roof.geometry.dispose()
    material.dispose()
    return {
      selected,
      roofTitle,
      detached,
      range,
      wireframe,
      originals,
      facade,
      facadeTitle,
      follows,
      cleared,
    }
  }, process.cwd())
  expect(result).toEqual({
    selected: true,
    roofTitle: 'Edificio · first',
    detached: true,
    range: { start: 0, count: 36 },
    wireframe: false,
    originals: true,
    facade: true,
    facadeTitle: 'Edificio · first',
    follows: true,
    cleared: true,
  })
})
