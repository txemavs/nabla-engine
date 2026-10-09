import { test, expect } from '@playwright/test'

test('dark cabin and silver metal get indirect light across camera/shadow changes', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { applyVehicleEnvironment } = await import(
      '/@fs/' + root + '/src/render/vehicle-presentation/reflection-environment.ts'
    )
    const { ShadowManager } = await import('/@fs/' + root + '/src/render/shadows.ts')
    const renderer = new T.WebGLRenderer()
    renderer.setSize(96, 96)
    renderer.shadowMap.enabled = true
    const scene = new T.Scene()
    const camera = new T.PerspectiveCamera(45, 1, 0.1, 5000)
    const material = new T.MeshStandardMaterial({ color: '#090909', metalness: 0, roughness: 0.4 })
    const geometry = new T.SphereGeometry(1, 32, 24)
    scene.add(new T.Mesh(geometry, material))
    const rig = applyVehicleEnvironment(scene)
    const shadows = new ShadowManager()
    shadows.setupMaterial(material)
    const target = new T.WebGLRenderTarget(96, 96)
    const pixels = new Uint8Array(96 * 96 * 4)
    const measurements = []
    for (const metalness of [0, 1]) {
      material.metalness = metalness
      material.color.set(metalness === 0 ? '#090909' : '#dadde1')
      material.needsUpdate = true
      for (const quality of [0, 512, 2048, 0]) {
        camera.position.set(0, 0, 4)
        camera.lookAt(0, 0, 0)
        shadows.reconfigure(quality, camera, scene, new T.Vector3(1, -2, 1), 0)
        // Exercise distant/zenithal projection, then return to the same near camera.
        camera.position.set(0, 150, 0.01)
        camera.lookAt(0, 0, 0)
        shadows.update(camera, new T.Vector3())
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
        camera.position.set(0, 0, 4)
        camera.lookAt(0, 0, 0)
        shadows.update(camera, new T.Vector3())
        for (const enabled of [true, false, true]) {
          for (const light of shadows.lights) light.shadow.intensity = enabled ? 1 : 0
          renderer.render(scene, camera)
          renderer.readRenderTargetPixels(target, 0, 0, 96, 96, pixels)
          let sum = 0
          for (let y = 32; y < 64; y++)
            for (let x = 32; x < 64; x++) {
              const i = (y * 96 + x) * 4
              sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
            }
          measurements.push({ metalness, quality, enabled, brightness: sum / 1024 })
        }
      }
    }
    shadows.dispose()
    target.dispose()
    geometry.dispose()
    material.dispose()
    renderer.dispose()
    return { measurements, materialCount: rig.materials.length }
  }, process.cwd())
  expect(result.materialCount).toBe(1)
  for (const metalness of [0, 1]) {
    const samples = result.measurements.filter((sample) => sample.metalness === metalness)
    // Offscreen targets store linear RGB; even a #090909 dielectric must have a signal.
    expect(samples[0].brightness).toBeGreaterThan(0.5)
    // CSM changes shader variants; tolerate their small numerical difference,
    // while rejecting a black result or a substantial change in illumination.
    for (const sample of samples)
      expect(Math.abs(sample.brightness - samples[0].brightness)).toBeLessThan(
        Math.max(0.25, samples[0].brightness * 0.05),
      )
    for (let i = 0; i < samples.length; i += 3) {
      expect(samples[i + 1].brightness).toBeCloseTo(samples[i].brightness, 5)
      expect(samples[i + 2].brightness).toBeCloseTo(samples[i].brightness, 5)
    }
  }
})
