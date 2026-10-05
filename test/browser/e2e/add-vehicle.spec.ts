import { test, expect } from '@playwright/test'

test('SceneView installs a vehicle added while running and releases it on removal', async ({
  page,
}) => {
  await page.route('**/add-vehicle', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/add-vehicle')
  const result = await page.evaluate(async (root) => {
    const { SceneView } = await import(`/@fs/${root}/src/presentation/scene-view.ts`)
    const { presetVehicle } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const view = new SceneView({
      version: 1,
      name: 'Add',
      entities: [createEntity('spawn', 'spawn')],
    })
    await view.ready
    const children = view.root.children.length
    view.addVehicles([presetVehicle('white-truck', 'added-1', [0, 1.6, -8])])
    await view.ready
    const added = {
      object: view.objects.has('added-1'),
      wheels: view.wheels.get('added-1')?.length ?? 0,
      inDocument: view.document.entities.some((e: { id: string }) => e.id === 'added-1'),
      children: view.root.children.length,
    }
    let duplicate = ''
    try {
      view.addVehicles([presetVehicle('car', 'added-1', [0, 1, 0])])
    } catch (error) {
      duplicate = (error as Error).message
    }
    view.removeVehicle('added-1')
    const removed = {
      object: view.objects.has('added-1'),
      wheels: view.wheels.has('added-1'),
      inDocument: view.document.entities.some((e: { id: string }) => e.id === 'added-1'),
      children: view.root.children.length,
    }
    view.dispose()
    return { children, added, duplicate, removed }
  }, process.cwd())
  expect(result.added.object).toBe(true)
  expect(result.added.wheels).toBe(4)
  expect(result.added.inDocument).toBe(true)
  expect(result.added.children).toBeGreaterThan(result.children)
  expect(result.duplicate).toMatch(/already in use/)
  expect(result.removed).toEqual({
    object: false,
    wheels: false,
    inDocument: false,
    children: result.children,
  })
})
