import { test, expect } from '@playwright/test'

test('Wrangler shares four wheel geometries and stays within its draw budget', async ({ page }) => {
  await page.route('**/wrangler-preview', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/wrangler-preview')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { SceneView } = await import(`/@fs${root}/src/presentation/scene-view.ts`)
    const { presetVehicle } = await import(`/@fs${root}/src/catalog/vehicles/library.ts`)
    const { createEntity } = await import(`/@fs${root}/src/entity/schema.ts`)
    const jeep = presetVehicle('jeep', 'jeep', [0, 0.78, 0])
    const renderer = new T.WebGLRenderer({ antialias: true })
    renderer.setSize(1100, 750)
    renderer.setClearColor('#b9cfdf')
    document.body.replaceChildren(renderer.domElement)
    const scene = new T.Scene()
    scene.add(new T.HemisphereLight(0xffffff, 0x666666, 2))
    const sun = new T.DirectionalLight(0xffffff, 3)
    sun.position.set(-3, 6, -4)
    scene.add(sun)
    const view = new SceneView({
      version: 1,
      name: 'Wrangler',
      entities: [jeep, createEntity('spawn', 'spawn')],
    })
    await view.ready
    const body = view.objects.get('jeep')
    scene.add(body)
    const geometries: Set<unknown>[] = []
    for (const wheel of view.wheels.get('jeep')) {
      const set = new Set<unknown>()
      wheel.traverse((node: import('three').Object3D) => {
        if (node instanceof T.Mesh) set.add((node as import('three').Mesh).geometry)
      })
      geometries.push(set)
    }
    const camera = new T.PerspectiveCamera(43, 1100 / 750, 0.1, 100)
    camera.position.set(-5, 3.3, -6)
    camera.lookAt(0, 0.9, 0)
    renderer.render(scene, camera)
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      shared: [...geometries[0]].every((g) => geometries.every((s) => s.has(g))),
      size: new T.Box3().setFromObject(body).getSize(new T.Vector3()).toArray(),
    }
  }, process.cwd())
  console.log('Wrangler render budget:', result)
  expect(result.shared).toBe(true)
  expect(result.calls).toBeLessThanOrEqual(47)
  expect(result.triangles).toBeLessThanOrEqual(40000)
  expect(result.size[2]).toBeCloseTo(4.197, 2)
  await page.screenshot({ path: 'test-results/wrangler.png' })
})
