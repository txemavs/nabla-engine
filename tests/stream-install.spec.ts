import { test, expect } from '@playwright/test'
import { createEntity } from '../src/scene.js'
const buildings = Array.from({ length: 200 }, (_, i) => ({
  ...createEntity(`building-${i}`, 'solid', [(i % 20) * 5, 0, Math.floor(i / 20) * 5]),
  source: {
    provider: 'openstreetmap' as const,
    id: `way/${i}`,
    retrievedAt: '2026-09-23',
    tags: { building: 'yes' },
  },
}))
test('streams mesh construction in bounded slices, including cancellation and batch visibility', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(
    async ({ root, buildings }) => {
      const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
      const module = '/view.ts'
      const { SceneView } = await import(module)
      const sceneModule = `/@fs${root}/src/scene.ts`
      const { createEntity } = await import(sceneModule)
      const view = new SceneView({
        version: 1,
        name: 'Pacing',
        entities: [createEntity('spawn', 'spawn')],
      })
      const started = performance.now()
      view.replaceMapEntities(new Set(), buildings)
      const installMs = performance.now() - started
      const initial = view.pendingMapInstall
      const populated = () =>
        [...view.objects.values()].filter(
          (g: any) =>
            g.userData.entityId?.startsWith('building-') &&
            g.children.some((c: any) => c.isMesh && c.material.isMeshStandardMaterial),
        ).length
      const before = populated()
      view.flushMapInstall(1000, 7)
      const first = populated(),
        remaining = view.pendingMapInstall
      view.replaceMapEntities(new Set(['building-199']), [])
      while (view.pendingMapInstall) view.flushMapInstall(4, 24)
      const total = populated()
      view.setPlaying(true)
      for (let i = 0; i < 50; i++) view.limitDrawDistance(new T.Vector3(30, 30, 30), 1000, true)
      const rendered = view.buildings.root.children.length
      view.dispose()
      return {
        initial,
        before,
        first,
        remaining,
        total,
        rendered,
        installMs,
        pending: view.pendingMapInstall,
      }
    },
    { root: process.cwd(), buildings },
  )
  console.log('Stream installation', result)
  expect(result.initial).toBe(200)
  expect(result.before).toBe(0)
  expect(result.first).toBe(7)
  expect(result.remaining).toBe(193)
  expect(result.total).toBe(199)
  expect(result.pending).toBe(0)
  expect(result.rendered).toBeGreaterThan(0)
})
