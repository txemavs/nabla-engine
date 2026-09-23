import { test, expect } from '@playwright/test'
test('loading message paints before the engine arrives', async ({ page }) => {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/main.ts', async (route) => {
    await wait
    await route.continue()
  })
  await page.goto('/?scene=circuit&studio=desktop', { waitUntil: 'commit' })
  await expect(page.locator('#boot-status')).toBeVisible()
  await expect(page.locator('#boot-message')).toContainText(/Cargando|Abriendo/)
  release()
  await expect(page.locator('.studio-workspace')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#boot-status')).toBeHidden()
})

test('initial map geometry is queued and installed incrementally', async ({ page }) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const { SceneView } = await import(String('/view.ts'))
    const { createEntity } = await import(`/@fs${root}/src/scene.ts`)
    const entities = [
      createEntity('spawn', 'spawn'),
      ...Array.from({ length: 1000 }, (_, i) => {
        const e = createEntity('osm-tree-' + i, 'box')
        e.source = {
          provider: 'openstreetmap',
          id: 'node/' + i,
          retrievedAt: '2026-09-23',
          tags: { natural: 'tree' },
        }
        return e
      }),
    ]
    const view = new SceneView({ version: 1, name: 'Large map', entities })
    await view.ready
    const before = { pending: view.pendingMapInstall, objects: view.objects.size }
    view.flushMapInstall(100, 10)
    const after = { pending: view.pendingMapInstall, objects: view.objects.size }
    view.dispose()
    return { before, after }
  }, process.cwd())
  expect(result.before).toEqual({ pending: 1000, objects: 1 })
  expect(result.after).toEqual({ pending: 990, objects: 11 })
})

test('an empty viewport stays responsive while project preparation is pending', async ({
  page,
}) => {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/startup.worker.ts*', async (route) => {
    await wait
    await route.continue()
  })
  await page.goto('/?scene=circuit&studio=desktop', { waitUntil: 'commit' })
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-startup', 'loading')
  await expect(page.locator('#boot-status')).toBeHidden()
  await expect(page.locator('#scene-name')).toHaveText('Preparando mundo')
  await expect(page.locator('#map-install-status')).toBeVisible()
  // The browser can continue scheduling frames while the worker is unavailable.
  const frames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let count = 0
        const tick = () => {
          if (++count === 6) resolve(count)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
  expect(frames).toBe(6)
  release()
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-startup', 'ready', {
    timeout: 30000,
  })
  await expect(page.locator('#scene-name')).toHaveText('Distrito cero')
})
