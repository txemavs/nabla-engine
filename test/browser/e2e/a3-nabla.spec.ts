import { test, expect } from '@playwright/test'

test('A3 Nabla shares four wheel geometries and stays within its draw budget', async ({ page }) => {
  await page.route('**/a3-preview', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/a3-preview')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { SceneView } = await import(`/@fs/${root}/src/presentation/scene-view.ts`)
    const { presetVehicle } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const car = presetVehicle('car', 'a3', [0, 0.55, 0])
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
      name: 'A3 Nabla',
      entities: [car, createEntity('spawn', 'spawn')],
    })
    await view.ready
    const body = view.objects.get('a3')
    scene.add(body)
    const geometries: Set<unknown>[] = []
    for (const wheel of view.wheels.get('a3')) {
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
    const seals = new T.Raycaster(new T.Vector3(0, 0.05, 0), new T.Vector3(0, 1, 0), 0, 1)
      .intersectObject(body, true)
      .some((hit: import('three').Intersection) => hit.object.name.includes('underfloor'))
    const paintSides: boolean[] = []
    body.traverse((node: import('three').Object3D) => {
      if (!(node instanceof T.Mesh)) return
      const mesh = node as import('three').Mesh
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        if (/^Pintura/.test(material.name))
          paintSides.push(material.side === T.DoubleSide && material.shadowSide === T.DoubleSide)
    })
    ;(window as unknown as { a3Detail: () => void }).a3Detail = () => {
      for (const wheel of view.wheels.get('a3').slice(0, 2)) wheel.rotation.y = 0.45
      camera.position.set(-1.9, 0.25, -2)
      camera.lookAt(-0.55, 0.33, -1.1)
      renderer.render(scene, camera)
    }
    return {
      seals,
      paintSides,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      shared: [...geometries[0]].every((g) => geometries.every((s) => s.has(g))),
      size: new T.Box3().setFromObject(body).getSize(new T.Vector3()).toArray(),
    }
  }, process.cwd())
  console.log('A3 Nabla render budget:', result)
  expect(result.seals).toBe(true)
  expect(result.paintSides.length).toBeGreaterThan(0)
  expect(result.paintSides.every(Boolean)).toBe(true)
  expect(result.shared).toBe(true)
  expect(result.calls).toBeLessThanOrEqual(170)
  expect(result.triangles).toBeLessThanOrEqual(110000)
  expect(result.size[2]).toBeCloseTo(4.407, 2)
  await page.screenshot({ path: 'test-results/a3-nabla.png' })
  await page.evaluate(() => (window as unknown as { a3Detail: () => void }).a3Detail())
  await page.screenshot({ path: 'test-results/a3-wheel-clearance.png' })
})
