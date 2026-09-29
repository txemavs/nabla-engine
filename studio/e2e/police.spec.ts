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
      liveryTextures: view.beacons.get('jeep')?.textures.length ?? 0,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      shared: [...geometries[0]].every((g) => geometries.every((s) => s.has(g))),
      size: new T.Box3().setFromObject(body).getSize(new T.Vector3()).toArray(),
    }
  }, process.cwd())
  console.log('Bilbao police Focus render budget:', result)
  expect(result.liveryTextures).toBe(6)
  expect(result.shared).toBe(true)
  expect(result.calls).toBeLessThanOrEqual(55)
  expect(result.triangles).toBeLessThanOrEqual(150000)
  expect(result.size[2]).toBeCloseTo(4.407, 2)
  await page.screenshot({ path: 'test-results/police-focus.png' })
})

test('simulation poses cannot be reused as editor poses after Stop or in cockpit', async ({
  page,
}) => {
  await page.route('**/vehicle-lifecycle', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/vehicle-lifecycle')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { SceneView } = await import(`/@fs${root}/src/presentation/scene-view.ts`)
    const { createPoliceCar } = await import(`/@fs${root}/src/catalog/vehicles/police.ts`)
    const { createEntity } = await import(`/@fs${root}/src/entity/schema.ts`)
    const { Simulation } = await import(`/@fs${root}/src/simulation/simulation.ts`)
    const { initPhysics } = await import(`/@fs${root}/src/simulation/physics.ts`)
    await initPhysics()
    const car = createPoliceCar('police', [12, 1, -20])
    const doc = { version: 1, name: 'Lifecycle', entities: [car, createEntity('spawn', 'spawn')] }
    const view = new SceneView(doc)
    await view.ready
    const cleanReuse = view.updateEditorPoses(structuredClone(doc))
    const sim = new Simulation(doc)
    view.setPlaying(true)
    sim.startInVehicle('police')
    sim.step(1 / 60)
    view.sync(sim, 1 / 60, true)
    const inWorld = view.wheels
      .get('police')
      .every((w: import('three').Object3D) => w.parent === view.root)
    const cockpitReuse = view.updateEditorPoses(structuredClone(doc))
    view.setPlaying(false)
    const stoppedReuse = view.updateEditorPoses(structuredClone(doc))
    view.dispose()
    sim.dispose()
    const restored = new SceneView(doc)
    await restored.ready
    const carGroup = restored.objects.get('police')
    const attached = restored.wheels
      .get('police')
      .every(
        (w: import('three').Object3D, i: number) =>
          w.parent === carGroup &&
          w.position.distanceTo(new T.Vector3(...car.vehicle.hubs[i])) < 1e-6,
      )
    const decorated = restored.beacons.get('police').textures.length === 6
    restored.dispose()
    return { cleanReuse, inWorld, cockpitReuse, stoppedReuse, attached, decorated }
  }, process.cwd())
  expect(result).toEqual({
    cleanReuse: true,
    inWorld: true,
    cockpitReuse: false,
    stoppedReuse: false,
    attached: true,
    decorated: true,
  })
})
