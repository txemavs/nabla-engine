import { expect, test } from '@playwright/test'

test('paths remain above grass in both individual and batched rendering', async ({ page }) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const sceneModule = `/@fs${root}/src/scene.ts`
    const viewModule = '/view.ts'
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const { createEntity } = await import(sceneModule)
    const { SceneView } = await import(viewModule)
    const terrain = {
      ...createEntity('terrain', 'terrain'),
      terrain: { columns: 3, rows: 3, spacing: 10, heights: [0, 1, 2, 0, 1, 2, 0, 1, 2] },
    }
    const path = {
      ...createEntity('path', 'group'),
      road: {
        terrainId: 'terrain',
        width: 2,
        paths: [
          [
            [-8, 0, 0],
            [8, 0, 0],
          ],
        ],
      },
      source: {
        provider: 'openstreetmap',
        id: 'way/1',
        retrievedAt: '2026-09-23',
        tags: { highway: 'path' },
      },
    }
    const view = new SceneView({
      version: 1,
      name: 'Grass path',
      entities: [terrain, path, createEntity('spawn', 'spawn')],
    })
    while (view.pendingMapInstall) view.flushMapInstall(1000, 24)
    const surface = view.objects.get('path').children.find((o: any) => o.isMesh)
    const offset = surface.position.y
    const individual = surface.material.polygonOffsetFactor
    view.limitDrawDistance(new T.Vector3(0, 100, 0), 1000, true)
    const batched = view.roads.root.children[0].material.polygonOffsetFactor
    const enabled =
      surface.material.polygonOffset && view.roads.root.children[0].material.polygonOffset
    view.dispose()
    return { offset, individual, batched, enabled }
  }, process.cwd())
  expect(result.offset).toBe(0)
  expect(result.enabled).toBe(true)
  expect(result.individual).toBeLessThan(-11)
  expect(result.batched).toBe(result.individual)
})

test('transport crossings retain separate depth layers after GLB restoration', async ({ page }) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const groundModule = '/ground-material.ts'
    const tileModule = '/tile-asset.ts'
    const { transportLayer } = await import(groundModule)
    const { restoreTileLayers } = await import(tileModule)
    const entities = [
      { source: { tags: { highway: 'path' } } },
      { source: { tags: { highway: 'residential' } } },
      { railway: { part: 'ballast' }, source: { tags: { railway: 'rail' } } },
      { railway: { part: 'rail' }, source: { tags: { railway: 'rail' } } },
    ]
    const group = new T.Group()
    for (const [i, entity] of entities.entries()) {
      const mesh = new T.Mesh(new T.PlaneGeometry(), new T.MeshStandardMaterial())
      mesh.name = i === 2 ? 'osm-way-1-ballast-0' : 'osm-way-1-rail-0-0'
      // Previously exported GLBs all stored 12. Restore them without rebaking.
      mesh.userData = { category: 'Roads', source: entity.source, groundLayer: 12 }
      group.add(mesh)
    }
    restoreTileLayers(group)
    return {
      expected: entities.map(transportLayer),
      restored: group.children.map((mesh: any) => -mesh.material.polygonOffsetFactor),
    }
  }, process.cwd())
  expect(result.expected).toEqual([12, 13, 14, 15])
  expect(result.restored).toEqual(result.expected)
})
