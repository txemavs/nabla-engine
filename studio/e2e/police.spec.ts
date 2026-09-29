import { test, expect } from '@playwright/test'

test('Bilbao police Focus shares four wheel geometries and stays within its draw budget', async ({
  page,
}) => {
  await page.route('**/police-preview', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/police-preview')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { SceneView } = await import(`/@fs${root}/src/presentation/scene-view.ts`)
    const { createPoliceCar } = await import(`/@fs${root}/src/catalog/vehicles/police.ts`)
    const { createEntity } = await import(`/@fs${root}/src/entity/schema.ts`)
    const jeep = createPoliceCar('jeep', [0, 0.62, 0])
    const renderer = new T.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
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
      name: 'Bilbao police Focus',
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
    camera.position.set(-4, 2.5, -4.5)
    camera.lookAt(0, 0.9, 0)
    renderer.render(scene, camera)
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      shared: [...geometries[0]].every((g) => geometries.every((s) => s.has(g))),
      size: new T.Box3().setFromObject(body).getSize(new T.Vector3()).toArray(),
    }
  }, process.cwd())
  console.log('Bilbao police Focus render budget:', result)
  expect(result.shared).toBe(true)
  expect(result.calls).toBeLessThanOrEqual(55)
  expect(result.triangles).toBeLessThanOrEqual(150000)
  expect(result.size[2]).toBeCloseTo(4.407, 2)
  await page.screenshot({ path: 'test-results/police-focus.png' })
})
