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

test('pose edits preserve installed map meshes, batches and unfinished installation', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(
    async ({ root, buildings }) => {
      const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
      const viewModule = '/view.ts'
      const { SceneView } = await import(viewModule)
      const { createEntity } = await import(`/@fs${root}/src/scene.ts`)
      const parent = createEntity('parent', 'group')
      const child = { ...createEntity('child', 'box'), parentId: parent.id }
      const view = new SceneView({
        version: 1,
        name: 'Continuity',
        entities: [parent, child, createEntity('spawn', 'spawn'), ...buildings],
      })
      view.flushMapInstall(1000, 7)
      for (let i = 0; i < 3; i++) view.limitDrawDistance(new T.Vector3(0, 10, 0), 1000, true)
      const mesh = view.objects.get(buildings[0].id)
      const batch = view.buildings.root.children[0]
      const remaining = view.pendingMapInstall
      const edited = structuredClone(view.document)
      edited.entities[0].transform.position[0] += 10
      const accepted = view.updateEditorPoses(edited)
      view.limitDrawDistance(new T.Vector3(10, 10, 0), 1000, true)
      const stableMesh = view.objects.get(buildings[0].id) === mesh
      const stableBatch = view.buildings.root.children[0] === batch
      const childX = view.objects.get('child').position.x
      const pending = view.pendingMapInstall
      const incompatible = structuredClone(edited)
      incompatible.entities[1].size[0] += 2
      const rejectsGeometryChange = !view.updateEditorPoses(incompatible)
      while (view.pendingMapInstall) view.flushMapInstall(1000, 24)
      const installed = view.objects.has(buildings.at(-1)!.id)
      view.dispose()
      return {
        accepted,
        stableMesh,
        stableBatch,
        childX,
        remaining,
        pending,
        rejectsGeometryChange,
        installed,
      }
    },
    { root: process.cwd(), buildings },
  )
  expect(result).toEqual({
    accepted: true,
    stableMesh: true,
    stableBatch: true,
    childX: 10,
    remaining: 193,
    pending: 193,
    rejectsGeometryChange: true,
    installed: true,
  })
})

test('orbiting and a transform edit do not restart the scene asset lifecycle', async ({ page }) => {
  await page.goto('/?scene=circuit&studio=desktop')
  const canvas = page.locator('#viewport > canvas')
  await expect(canvas).toHaveAttribute('data-startup', 'ready')
  await expect(canvas).toHaveAttribute('data-assets', 'loaded')
  await page.evaluate(() => {
    const canvas = document.querySelector('#viewport > canvas')!
    canvas.setAttribute('data-test-reloads', '0')
    new MutationObserver((mutations) => {
      const count = mutations.filter((m) => m.attributeName === 'data-assets').length
      canvas.setAttribute(
        'data-test-reloads',
        String(Number(canvas.getAttribute('data-test-reloads')) + count),
      )
    }).observe(canvas, { attributes: true, attributeFilter: ['data-assets'] })
  })
  const bounds = (await canvas.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.4)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.5, {
    steps: 10,
  })
  await page.mouse.up({ button: 'middle' })
  await page.mouse.wheel(0, 120)
  const x = page.locator('[data-vector=position][data-axis="0"]')
  await page.evaluate(() => {
    const clone = window.structuredClone
    const canvas = document.querySelector('#viewport > canvas')!
    canvas.setAttribute('data-document-clones', '0')
    window.structuredClone = (value, options) => {
      if (value && typeof value === 'object' && 'entities' in value)
        canvas.setAttribute(
          'data-document-clones',
          String(Number(canvas.getAttribute('data-document-clones')) + 1),
        )
      return clone(value, options)
    }
  })
  await x.fill('2')
  await x.press('Tab')
  await expect(x).toHaveValue('2')
  await expect(canvas).toHaveAttribute('data-test-reloads', '0')
  await expect(canvas).toHaveAttribute('data-document-clones', '0')
})
