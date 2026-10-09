import { test, expect } from '@playwright/test'

test('prepared vehicle and additional lamps reuse the live shader programs', async ({ page }) => {
  await page.route('**/preload-presentation', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/preload-presentation')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { SceneView } = await import(`/@fs/${root}/src/presentation/scene-view.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const { createPlaceable } = await import(`/@fs/${root}/src/catalog/placeables.ts`)
    const { presetVehicle } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
    const { VehicleWarmup } = await import(`/@fs/${root}/src/runtime/vehicle-warmup.ts`)
    const { ShadowManager } = await import(`/@fs/${root}/src/render/shadows.ts`)
    const view = new SceneView({
      version: 1,
      name: 'Prepared',
      entities: [
        createEntity('spawn', 'spawn'),
        createEntity('floor', 'box', [0, -0.1, 0]),
        ...createPlaceable('globe', 'initial-globe'),
        ...createPlaceable('streetlight', 'initial-highway'),
      ],
    })
    await view.ready
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(45, 1, 0.1, 1000),
      renderer = new T.WebGLRenderer()
    renderer.setSize(160, 160)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = T.PCFShadowMap
    camera.position.set(6, 3, 6)
    camera.lookAt(0, 1, 0)
    scene.add(view.root, new T.AmbientLight('#fff', 1))
    const shadows = new ShadowManager()
    shadows.reconfigure(512, camera, scene, new T.Vector3(1, -2, 1), 3.2)
    view.setupMaterials((material: any) => shadows.setupMaterial(material))
    const count = () => renderer.info.programs!.length
    const lights = () => {
      let n = 0
      scene.traverse((o: any) => {
        if (o instanceof T.Light && o.visible) n++
      })
      return n
    }
    renderer.render(scene, camera)
    const initial = { programs: count(), lights: lights() }
    for (let i = 0; i < 3; i++) {
      view.addPlaced(createPlaceable('globe', `new-globe-${i}`))
      view.addPlaced(createPlaceable('streetlight', `new-highway-${i}`))
      renderer.render(scene, camera)
    }
    const addedLamps = { programs: count(), lights: lights() }
    const car = presetVehicle('car', 'new-car', [0, 1, -4])
    let preparedViews = 0
    const warmup = new VehicleWarmup({
      renderer,
      camera,
      scene,
      createView: (entities: any[]) => {
        preparedViews++
        const prepared = new SceneView({
          version: 1,
          name: 'Warm',
          entities: [createEntity('warm-spawn', 'spawn'), ...entities],
        })
        prepared.setupMaterials((material: any) => shadows.setupMaterial(material))
        return prepared
      },
    })
    await warmup.warm([car])
    await warmup.warm([{ ...car, id: 'same-car-another-colour', color: '#ff0000' }])
    const afterWarm = count()
    view.addVehicles([car])
    await new Promise((resolve) => setTimeout(resolve, 1000))
    renderer.render(scene, camera)
    const afterCar = count()
    warmup.dispose()
    view.dispose()
    shadows.dispose()
    renderer.dispose()
    return { initial, addedLamps, afterWarm, afterCar, preparedViews }
  }, process.cwd())
  console.log('PRELOAD', result)
  expect(result.addedLamps).toEqual(result.initial)
  expect(result.afterCar).toBe(result.afterWarm)
  expect(result.preparedViews).toBe(1)
})
