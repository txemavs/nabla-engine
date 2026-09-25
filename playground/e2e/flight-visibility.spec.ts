import { test, expect } from './studio-test.js'

test('preloaded ground stays visible while hovering above the low detail distance', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const samples = await page.evaluate(async (root) => {
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const path = '/geography.ts'
    const { GeographicView } = await import(path)
    const geography = new GeographicView(
      {
        version: 1,
        name: 'Flight',
        geography: { latitude: 41.5, longitude: -5.75, altitude: 0, imagery: 'offline' },
        entities: [{ terrain: {} }],
      },
      () => {},
      true,
    )
    geography.viewDistance = 1000
    const renderer = new T.WebGLRenderer()
    renderer.setSize(64, 64)
    const scene = new T.Scene()
    const material = new T.MeshBasicMaterial({ color: '#ff0000' })
    const plane = new T.Mesh(new T.PlaneGeometry(10000, 10000), material)
    plane.rotation.x = -Math.PI / 2
    scene.add(plane)
    const camera = new T.PerspectiveCamera(48, 1, 0.1, 10000)
    const target = new T.WebGLRenderTarget(64, 64)
    const samples = []
    for (const altitude of [100, 1200, 5000]) {
      geography.update([0, altitude, 0], new T.Vector3(), {
        mode: 'fixed',
        at: '2026-09-22T12:00:00Z',
      })
      const air = geography.atmosphere
      scene.fog = new T.Fog(air.color, air.near, air.far)
      camera.position.set(0, altitude, 0)
      camera.lookAt(0, 0, 0)
      camera.far = Math.hypot(1500, altitude)
      camera.updateProjectionMatrix()
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      const pixel = new Uint8Array(4)
      renderer.readRenderTargetPixels(target, 32, 32, 1, 1, pixel)
      samples.push({ altitude, red: pixel[0], green: pixel[1], blue: pixel[2] })
    }
    geography.dispose()
    target.dispose()
    plane.geometry.dispose()
    material.dispose()
    renderer.dispose()
    return samples
  }, process.cwd())
  for (const sample of samples) {
    expect(sample.red).toBeGreaterThan(240)
    expect(sample.green).toBeLessThan(10)
    expect(sample.blue).toBeLessThan(10)
  }
})
