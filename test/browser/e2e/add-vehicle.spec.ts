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

test('SceneView maps a late carrier stern portal onto its door monitor and drops it on removal', async ({
  page,
}) => {
  await page.route('**/add-carrier', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/add-carrier')
  const result = await page.evaluate(async (root) => {
    const { SceneView } = await import(`/@fs/${root}/src/presentation/scene-view.ts`)
    const { presetEntities } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const view = new SceneView({
      version: 1,
      name: 'Add carrier',
      entities: [createEntity('spawn', 'spawn')],
    })
    await view.ready
    view.addVehicles(presetEntities('carrier', 'late-ship', [0, 1.2, -20]))
    await view.ready
    const tablet = view.portalTablets.get('late-ship-stern')?.[0]
    const added = {
      portal: view.portals.has('late-ship-stern'),
      tablet: !!tablet,
      // The portal console shares the left door screen of the carrier interior.
      sharesDoorScreen: !!tablet && tablet !== view.placeScreens.get('late-ship'),
      inDocument: view.document.entities.some((e: { id: string }) => e.id === 'late-ship-stern'),
    }
    view.removeVehicle('late-ship')
    const removed = {
      portal: view.portals.has('late-ship-stern'),
      tablet: view.portalTablets.has('late-ship-stern'),
      object: view.objects.has('late-ship-stern'),
      inDocument: view.document.entities.some((e: { id: string }) => e.id === 'late-ship-stern'),
    }
    view.dispose()
    return { added, removed }
  }, process.cwd())
  expect(result.added).toEqual({
    portal: true,
    tablet: true,
    sharesDoorScreen: true,
    inDocument: true,
  })
  expect(result.removed).toEqual({ portal: false, tablet: false, object: false, inDocument: false })
})

test('SceneView installs and removes placed portals, gallery, sprite and lamps', async ({
  page,
}) => {
  await page.route('**/add-placed', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/add-placed')
  const result = await page.evaluate(async (root) => {
    const { SceneView } = await import(`/@fs/${root}/src/presentation/scene-view.ts`)
    const { createPlaceable } = await import(`/@fs/${root}/src/catalog/placeables.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const view = new SceneView({
      version: 1,
      name: 'Add placed',
      entities: [createEntity('spawn', 'spawn')],
    })
    await view.ready
    const kinds = ['portal', 'gallery', 'sprite', 'streetlight', 'globe']
    const batches = kinds.map((kind) => createPlaceable(kind, `p-${kind}`))
    for (const batch of batches) view.addPlaced(batch)
    await view.ready
    const ids = batches.flat().map((e: { id: string }) => e.id)
    const added = {
      objects: ids.every((id: string) => view.objects.has(id)),
      portal: view.portals.has('p-portal'),
      tablet: view.portalTablets.has('p-portal'),
      gallery: view.portals.has('p-gallery-window') && view.portals.has('p-gallery-back'),
    }
    for (const batch of batches) view.removePlaced(batch.map((e: { id: string }) => e.id))
    const removed = {
      objects: ids.some((id: string) => view.objects.has(id)),
      portals: view.portals.has('p-portal') || view.portals.has('p-gallery-window'),
      inDocument: view.document.entities.some((e: { id: string }) => ids.includes(e.id)),
    }
    view.dispose()
    return { added, removed }
  }, process.cwd())
  expect(result.added).toEqual({ objects: true, portal: true, tablet: true, gallery: true })
  expect(result.removed).toEqual({ objects: false, portals: false, inDocument: false })
})
