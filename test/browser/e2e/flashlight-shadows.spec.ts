import { test, expect } from '@playwright/test'

test('flashlight shadows keep lit surfaces bright with logarithmic scene depth', async ({
  page,
}) => {
  await page.route('**/flashlight-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/flashlight-check')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { Headlamp } = await import(`/@fs/${root}/src/render/entity/headlamp.ts`)
    const { VehicleLightRig } = await import(
      `/@fs/${root}/src/render/vehicle-presentation/light-rig.ts`
    )
    const samples = []
    for (const logarithmicDepthBuffer of [false, true]) {
      const renderer = new T.WebGLRenderer({ logarithmicDepthBuffer, preserveDrawingBuffer: true })
      renderer.setSize(64, 64)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = T.PCFShadowMap
      const scene = new T.Scene(),
        camera = new T.PerspectiveCamera(45, 1, 0.1, 100)
      camera.position.z = 5
      const rig = new VehicleLightRig(),
        lamp = new Headlamp(rig.pedestrianLight)
      scene.add(rig.root)
      lamp.enabled = true
      lamp.shadows = true
      lamp.update(camera, camera)
      const material = new T.MeshStandardMaterial({ color: 0x808080, roughness: 1 })
      const wall = new T.Mesh(new T.PlaneGeometry(10, 10), material)
      wall.receiveShadow = true
      scene.add(wall)
      // A caster BEHIND the wall must not shadow its lit front.
      const behind = new T.Mesh(new T.BoxGeometry(8, 8, 1), material)
      behind.position.z = -2
      behind.castShadow = true
      scene.add(behind)
      const pixel = new Uint8Array(4)
      renderer.render(scene, camera)
      renderer
        .getContext()
        .readPixels(
          32,
          32,
          1,
          1,
          renderer.getContext().RGBA,
          renderer.getContext().UNSIGNED_BYTE,
          pixel,
        )
      samples.push(pixel[0])
      renderer.dispose()
      rig.dispose()
      material.dispose()
      wall.geometry.dispose()
      behind.geometry.dispose()
    }
    return samples
  }, process.cwd())
  expect(result[0]).toBeGreaterThan(50)
  expect(result[1]).toBeGreaterThan(result[0] * 0.9)
})

test('flashlight casts a visible shadow onto a separate receiver', async ({ page }) => {
  await page.route('**/shadow-receiver', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/shadow-receiver')
  const samples = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { Headlamp } = await import(`/@fs/${root}/src/render/entity/headlamp.ts`)
    const renderer = new T.WebGLRenderer({ logarithmicDepthBuffer: true })
    renderer.setSize(128, 128)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = T.PCFShadowMap
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(60, 1, 0.1, 100)
    camera.position.set(0, 0, 6)
    camera.updateMatrixWorld()
    const light = new T.SpotLight(),
      lamp = new Headlamp(light)
    scene.add(light, light.target)
    lamp.enabled = true
    lamp.shadows = true
    const head = new T.Object3D()
    head.position.set(-2, 0, 5)
    lamp.update(head)
    light.target.position.set(0, 0, 0)
    const mat = new T.MeshStandardMaterial({ color: 0x808080 })
    const wall = new T.Mesh(new T.PlaneGeometry(12, 12), mat)
    wall.receiveShadow = true
    scene.add(wall)
    const cube = new T.Mesh(new T.BoxGeometry(0.6, 0.6, 0.6), mat)
    cube.position.set(0, 0, 2)
    cube.castShadow = true
    scene.add(cube)
    const point = new T.Vector3(1.4, 0, 0).project(camera)
    const pixel = new Uint8Array(4),
      values = []
    for (const strength of [0, 1]) {
      light.shadow.intensity = strength
      renderer.render(scene, camera)
      const gl = renderer.getContext()
      gl.readPixels(Math.floor((point.x + 1) * 64), 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
      values.push(pixel[0])
    }
    renderer.dispose()
    return values
  }, process.cwd())
  expect(samples[0]).toBeGreaterThan(30)
  expect(samples[1]).toBeLessThan(samples[0] * 0.5)
})
