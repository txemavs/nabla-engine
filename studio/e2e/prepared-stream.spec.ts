import { test, expect } from './studio-test.js'

test('installs even scene placeholders in bounded batches with terrain first', async ({ page }) => {
  await page.goto('/geography/geoeuskadi-pilot/manifest.json')
  const result = await page.evaluate(
    async (sceneModule) => {
      const { createEntity } = await import(sceneModule)
      const { SceneView } = await import(
        sceneModule.replace('/src/index.ts', '/src/presentation/scene-view.ts')
      )
      const view = new SceneView({
        version: 1,
        name: 'Batched',
        entities: [createEntity('spawn', 'spawn')],
      })
      const additions = Array.from({ length: 40 }, (_, i) =>
        createEntity(`block-${i}`, 'block', [i * 5, 0, 0]),
      )
      const terrain = createEntity('world-terrain', 'terrain')
      terrain.terrain = { columns: 2, rows: 2, spacing: 10, heights: [0, 0, 0, 0] }
      additions[0].kind = 'group'
      terrain.source = {
        provider: 'openstreetmap',
        id: 'way/1',
        retrievedAt: '2026-09-23',
        tags: {},
      }
      additions.push(terrain)
      view.replaceMapEntities(new Set(), additions)
      view.setPlaying(true)
      view.limitDrawDistance(view.root.position, 1000, true)
      const before = {
        pending: view.pendingMapInstall,
        objects: additions.filter((e) => view.objects.has(e.id)).length,
      }
      const installed = view.flushMapInstall(1000, 3)
      const after = {
        pending: view.pendingMapInstall,
        objects: additions.filter((e) => view.objects.has(e.id)).length,
        terrain: view.objects.has('world-terrain'),
      }
      view.dispose()
      return { before, installed, after }
    },
    '/@fs' + process.cwd() + '/src/index.ts',
  )
  expect(result.before).toEqual({ pending: 41, objects: 0 })
  expect(result.installed).toBe(3)
  expect(result.after).toEqual({ pending: 38, objects: 3, terrain: true })
})
