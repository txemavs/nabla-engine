import { test, expect } from '@playwright/test'

test('vehicle warmup allocates frozen shadow maps before sampling them', async ({ page }) => {
  await page.route('**/warmup-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/warmup-check')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { VehicleWarmup } = await import(`/@fs/${root}/src/runtime/vehicle-warmup.ts`)
    const renderer = new T.WebGLRenderer()
    renderer.setSize(32, 32)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = false
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(60, 1, 0.1, 100)
    camera.position.z = 5
    const light = new T.DirectionalLight('#ffffff', 3)
    light.position.set(2, 4, 2)
    light.castShadow = true
    light.shadow.mapSize.set(64, 64)
    scene.add(light)
    const group = new T.Group()
    const mesh = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial())
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
    const viewRoot = new T.Group()
    viewRoot.add(group)
    const warmup = new VehicleWarmup({
      renderer,
      scene,
      camera,
      createView: () => ({
        root: viewRoot,
        ready: Promise.resolve(),
        objects: new Map([['car', group]]),
        setPlaying() {},
        mirroredVehicles: [],
        renderMirrors() {},
        dispose() {},
      }),
    })
    await warmup.warm([{ id: 'car' }])
    const error = renderer.getContext().getError()
    const allocated = !!light.shadow.map
    const restored = renderer.shadowMap.needsUpdate === false
    warmup.dispose()
    light.shadow.dispose()
    mesh.geometry.dispose()
    mesh.material.dispose()
    renderer.dispose()
    return { error, allocated, restored }
  }, process.cwd())
  expect(result).toEqual({ error: 0, allocated: true, restored: true })
})
