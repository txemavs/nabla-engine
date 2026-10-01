import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('equipment bench animates and stops monitor updates when retracted without loading vehicles or physics', async ({
  page,
}) => {
  const requests: string[] = [],
    errors: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/examples/equipment.html')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-equipment', 'ready')
  await expect(canvas).toHaveAttribute('data-updates', '0')
  await page.keyboard.press('KeyH')
  await expect(canvas).toHaveAttribute('data-progress', '1')
  expect(Number(await canvas.getAttribute('data-updates'))).toBeGreaterThan(0)
  await page.keyboard.press('KeyB')
  await expect(page.locator('#status')).toContainText('Freno: sí')
  await page.screenshot({ path: 'test-results/equipment-bench.png' })
  await page.keyboard.press('KeyH')
  await expect(canvas).toHaveAttribute('data-open', 'false')
  const updates = await canvas.getAttribute('data-updates')
  await expect(canvas).toHaveAttribute('data-progress', '0')
  await expect(canvas).toHaveAttribute('data-updates', updates!)
  expect(
    requests.filter((url) => /\/catalog\/|\/simulation\/|rapier|html-monitor|\.glb/.test(url)),
  ).toEqual([])
  expect(errors).toEqual([])
})

test('explicit adapter survives a renamed asset and disposal preserves another instance shared geometry', async ({
  page,
}) => {
  await page.route('**/equipment-assets', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.route('**/world/custom-body.glb', async (r) =>
    r.fulfill({
      contentType: 'model/gltf-binary',
      body: await readFile('assets/studio/cars/a3/a3.cabrio.glb'),
    }),
  )
  await page.goto('/equipment-assets')
  const result = await page.evaluate(async (root) => {
    const { SceneView } = await import(`/@fs${root}/src/presentation/scene-view.ts`)
    const { presetVehicle } = await import(`/@fs${root}/src/catalog/vehicles/library.ts`)
    const { createEntity } = await import(`/@fs${root}/src/entity/schema.ts`)
    const { assets, disposeObject } = await import(`/@fs${root}/src/render/entity/assets.ts`)
    const { createA3Mounts } = await import(`/@fs${root}/src/catalog/presentation/a3-mounts.ts`)
    const car = presetVehicle('car', 'car')
    car.visual.body.url = '/world/custom-body.glb'
    const view = new SceneView({
      version: 1,
      name: 'Renamed car',
      entities: [car, createEntity('spawn', 'spawn')],
    })
    await view.ready
    const equipped = !!view.vehicleMenu('car')
    const offset = view.vehicleHeadOffset('car')
    view.dispose()
    view.dispose()
    const [a, b] = await Promise.all([
      assets.instantiate('/studio/cars/a3/a3.cabrio.glb'),
      assets.instantiate('/studio/cars/a3/a3.cabrio.glb'),
    ])
    const refs: { mesh: import('three').Mesh; geometry: import('three').BufferGeometry }[] = []
    let sharedDisposals = 0
    a.traverse((node: import('three').Object3D) => {
      const mesh = node as import('three').Mesh
      if (!mesh.isMesh) return
      refs.push({ mesh, geometry: mesh.geometry })
      mesh.geometry.addEventListener('dispose', () => sharedDisposals++)
    })
    const mounts = createA3Mounts(a)
    const changed = refs.filter((item) => item.mesh.geometry !== item.geometry)
    let cutsDisposed = 0
    for (const item of changed) item.mesh.geometry.addEventListener('dispose', () => cutsDisposed++)
    mounts.dispose()
    mounts.dispose()
    const restored = refs.every(
      (item) => item.mesh.geometry === item.geometry && item.mesh.userData.sharedAssetGeometry,
    )
    disposeObject(a)
    const intact = refs.some((item) => {
      let shared = false
      b.traverse((node: import('three').Object3D) => {
        if ((node as import('three').Mesh).geometry === item.geometry) shared = true
      })
      return shared
    })
    disposeObject(b)
    return {
      equipped,
      offset,
      changed: changed.length,
      cutsDisposed,
      restored,
      intact,
      sharedDisposals,
    }
  }, process.cwd())
  expect(result.equipped).toBe(true)
  expect(result.offset).toEqual([0, -0.15, -0.36])
  expect(result.changed).toBeGreaterThan(0)
  expect(result.cutsDisposed).toBe(result.changed)
  expect(result.restored).toBe(true)
  expect(result.intact).toBe(true)
  expect(result.sharedDisposals).toBe(0)
})
