import { test, expect } from '@playwright/test'

test('maintained road car loads separate wheels and renders without WebGL errors', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/road-car-preview', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/road-car-preview')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { SceneView } = await import(`/@fs/${root}/src/presentation/scene-view.ts`)
    const { presetVehicle } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const view = new SceneView({
      version: 1,
      name: 'Road car',
      entities: [createEntity('spawn', 'spawn'), presetVehicle('car', 'car', [0, 0.6, 0])],
    })
    await view.ready
    const renderer = new T.WebGLRenderer()
    renderer.setSize(320, 240)
    const scene = new T.Scene()
    scene.add(view.root, new T.HemisphereLight(0xffffff, 0x444444, 2))
    const camera = new T.PerspectiveCamera(45, 4 / 3, 0.1, 100)
    camera.position.set(5, 3, 6)
    camera.lookAt(0, 1, 0)
    renderer.render(scene, camera)
    const wheels = view.wheels.get('car') ?? []
    const result = {
      wheels: wheels.length,
      independentWheels: new Set(wheels).size,
      glError: renderer.getContext().getError(),
      draws: renderer.info.render.calls,
    }
    view.dispose()
    renderer.dispose()
    return result
  }, process.cwd())
  expect(errors).toEqual([])
  expect(result.wheels).toBe(4)
  expect(result.independentWheels).toBe(4)
  expect(result.glError).toBe(0)
  expect(result.draws).toBeGreaterThan(0)
})
