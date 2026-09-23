import { expect, test } from './studio-test.js'

test('tile GLB round-trip preserves mesh identity, bounds, triangles and vertex colors', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const module = '/tile-asset.ts'
    const sceneModule = `/@fs${root}/src/scene.ts`
    const { tileAsset, restoreTileLayers } = await import(module)
    const { createEntity } = await import(sceneModule)
    const { GLTFExporter } = await import(
      `/@fs${root}/node_modules/three/examples/jsm/exporters/GLTFExporter.js`
    )
    const { GLTFLoader } = await import(
      `/@fs${root}/node_modules/three/examples/jsm/loaders/GLTFLoader.js`
    )
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const entity = createEntity('building-42', 'solid', [1210, 20, -1195])
    const tile = tileAsset({
      version: 5,
      origin: { latitude: 43, longitude: -2, altitude: 30 },
      key: '1_-1',
      entities: [entity],
      geometry: {
        'building-42': {
          position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer,
          normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]).buffer,
          color: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]).buffer,
        },
      },
    })
    const before = new T.Box3().setFromObject(tile)
    const binary = await new GLTFExporter().parseAsync(tile, { binary: true })
    const loaded = (await new GLTFLoader().parseAsync(binary, '')).scene
    restoreTileLayers(loaded)
    const after = new T.Box3().setFromObject(loaded)
    let found: any
    loaded.traverse((o: any) => {
      if (o.isMesh) found = o
    })
    return {
      before: [before.min.toArray(), before.max.toArray()],
      after: [after.min.toArray(), after.max.toArray()],
      id: found.userData.entityId,
      color: Array.from(found.geometry.getAttribute('color').array),
      count: found.geometry.getAttribute('position').count,
      metadata: loaded.children[0].userData.nablaTile,
    }
  }, process.cwd())
  expect(result.after).toEqual(result.before)
  expect(result.before[0]).toEqual([10, 20, 5])
  expect(result.id).toBe('building-42')
  expect(result.count).toBe(3)
  expect(result.color).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0])
  expect(result.metadata.localOffset).toEqual([1200, 0, -1200])
})
