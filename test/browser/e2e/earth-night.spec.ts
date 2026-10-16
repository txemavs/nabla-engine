import { test, expect } from '@playwright/test'

test('Earth city lights follow the world-space sun, fade through twilight and preserve cloud shading', async ({
  page,
}) => {
  await page.route('**/earth-night-test', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body style="margin:0;background:black"></body>',
    }),
  )
  await page.goto('/earth-night-test')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  const result = await page.evaluate(async (root) => {
    const T = await import(`/@fs/${root}/node_modules/three/build/three.module.js`)
    const { shadeEarthWithClouds } = await import(
      `/@fs/${root}/src/render/planet/artistic-clouds.ts`
    )
    const renderer = new T.WebGLRenderer({ preserveDrawingBuffer: true })
    renderer.setSize(600, 600)
    document.body.append(renderer.domElement)
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.z = 4
    const sun = new T.Vector3(0, 0, 1),
      cover = { value: 0 }
    const texture = new T.DataTexture(new Uint8Array([255, 210, 130, 255]), 1, 1)
    texture.colorSpace = T.SRGBColorSpace
    texture.needsUpdate = true
    const nightMap = { value: texture }
    const material = new T.MeshLambertMaterial({ color: 0x000000 })
    shadeEarthWithClouds(material, sun, cover, { value: 0 }, { value: 0.4 }, nightMap)
    const sphere = new T.Mesh(new T.SphereGeometry(1, 96, 64), material)
    scene.add(sphere)
    const sample = () => {
      renderer.render(scene, camera)
      const pixel = new Uint8Array(4)
      renderer
        .getContext()
        .readPixels(
          300,
          300,
          1,
          1,
          renderer.getContext().RGBA,
          renderer.getContext().UNSIGNED_BYTE,
          pixel,
        )
      return Array.from(pixel)
    }
    const day = sample()
    sun.set(1, 0, 0)
    const twilight = sample()
    sun.set(0, 0, -1)
    const night = sample()
    sphere.rotation.y = Math.PI
    const rotatedNight = sample()
    // A missing optional texture stays black, rather than turning into a pale fallback.
    nightMap.value = null
    const missing = sample()
    // Render the actual NASA textures for visual inspection with a Europe-facing camera.
    const loader = new T.TextureLoader()
    const base = `/@fs/${root}/assets/geography/`
    material.map = await loader.loadAsync(base + 'earth.jpg')
    material.map.colorSpace = T.SRGBColorSpace
    material.color.set('white')
    nightMap.value = await loader.loadAsync(base + 'earth-night.jpg')
    nightMap.value.colorSpace = T.SRGBColorSpace
    material.needsUpdate = true
    sphere.rotation.y = 0
    camera.position.set(-0.3, 1.4, -3.7)
    camera.lookAt(0, 0, 0)
    sun.set(-1, 0.1, 0.2).normalize()
    scene.add(new T.DirectionalLight('white', 2.5))
    scene.children[1].position.copy(sun)
    renderer.render(scene, camera)
    return { day, twilight, night, rotatedNight, missing, calls: renderer.info.render.calls }
  }, process.cwd())
  expect(result.day[0]).toBeLessThan(3)
  expect(result.night[0]).toBeGreaterThan(180)
  expect(result.twilight[0]).toBeGreaterThan(result.day[0])
  expect(result.twilight[0]).toBeLessThan(result.night[0])
  expect(result.rotatedNight).toEqual(result.night)
  expect(result.missing[0]).toBeLessThan(3)
  expect(result.calls).toBe(1)
  expect(errors).toEqual([])
  await page.screenshot({ path: '/tmp/earth-night-preview.png' })
})
