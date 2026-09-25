import { test, expect } from './studio-test.js'

test('metal reflections survive every shadow tier without changing materials', async ({ page }) => {
  await page.goto('/?scene=circuit')
  const measurements = await page.evaluate(async (root) => {
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const { RoomEnvironment } = await import(
      `/@fs${root}/node_modules/three/examples/jsm/environments/RoomEnvironment.js`
    )
    const csmPath = '/csm.ts'
    const { ShadowManager } = await import(csmPath)
    const renderer = new T.WebGLRenderer()
    renderer.setSize(96, 96)
    renderer.shadowMap.enabled = true
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 4)
    camera.lookAt(0, 0, 0)
    const room = new RoomEnvironment(),
      pmrem = new T.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(room, 0.04)
    scene.environment = environment.texture
    const material = new T.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.2 })
    const geometry = new T.SphereGeometry(1, 32, 24),
      mesh = new T.Mesh(geometry, material)
    mesh.receiveShadow = true
    scene.add(mesh)
    const target = new T.WebGLRenderTarget(96, 96),
      pixels = new Uint8Array(96 * 96 * 4)
    const manager = new ShadowManager()
    manager.setupMaterial(material)
    const result = []
    for (const quality of [0, 512, 1024, 2048, 0]) {
      // No direct light: the measured signal comes exclusively from reflections.
      manager.reconfigure(quality, camera, scene, new T.Vector3(1, -2, 1), 0)
      manager.update(camera, new T.Vector3())
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      renderer.readRenderTargetPixels(target, 0, 0, 96, 96, pixels)
      let brightness = 0
      for (let y = 32; y < 64; y++)
        for (let x = 32; x < 64; x++) {
          const i = (y * 96 + x) * 4
          brightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
        }
      result.push({
        quality,
        brightness: brightness / 1024,
        roughness: material.roughness,
        metalness: material.metalness,
      })
    }
    manager.dispose()
    geometry.dispose()
    material.dispose()
    target.dispose()
    environment.dispose()
    room.dispose()
    pmrem.dispose()
    renderer.dispose()
    return result
  }, process.cwd())
  expect(measurements[0].brightness).toBeGreaterThan(30)
  for (const sample of measurements) {
    expect(Math.abs(sample.brightness - measurements[0].brightness)).toBeLessThan(2)
    expect(sample.roughness).toBe(0.2)
    expect(sample.metalness).toBe(1)
  }
})
