import { test, expect } from '@playwright/test'

test('ten-spoke wheel retains tyre dimensions with a lower shared draw budget', async ({
  page,
}) => {
  await page.route('**/wheel-preview', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0"></body>' }),
  )
  await page.goto('/wheel-preview')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const result = await page.evaluate(async () => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { GLTFLoader, RoomEnvironment } = T
    const renderer = new T.WebGLRenderer({ antialias: true })
    renderer.setSize(900, 700)
    document.body.append(renderer.domElement)
    const scene = new T.Scene()
    scene.background = new T.Color('#65727e')
    const pmrem = new T.PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    scene.environment = pmrem.fromScene(room).texture
    scene.add(new T.HemisphereLight(0xffffff, 0x444444, 2))
    const sun = new T.DirectionalLight(0xffffff, 3)
    sun.position.set(3, 4, 2)
    scene.add(sun)
    const wheel = (await new GLTFLoader().loadAsync('/library/cars/a3/a3.wheel.glb')).scene
    scene.add(wheel)
    const camera = new T.PerspectiveCamera(36, 900 / 700, 0.01, 10)
    camera.position.set(1.35, 0.12, 0.23)
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
    let tyreTriangles = 0
    wheel.traverse((o: import('three').Object3D) => {
      const mesh = o as import('three').Mesh
      if (
        mesh.isMesh &&
        (mesh.material as import('three').Material).name === 'Nabla lightweight tyre'
      )
        tyreTriangles = mesh.geometry.index!.count / 3
    })
    return {
      size: new T.Box3().setFromObject(wheel).getSize(new T.Vector3()).toArray(),
      tyreTriangles,
      triangles: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
    }
  })
  expect(result.size[1]).toBeCloseTo(0.63, 2)
  expect(result.size[2]).toBeCloseTo(0.63, 2)
  expect(result.tyreTriangles).toBeLessThan(2200)
  expect(result.triangles).toBeLessThan(4700)
  expect(result.calls).toBe(4)
  expect(errors).toEqual([])
  console.log('Wheel budget', result)
  await page.screenshot({ path: 'test-results/a3-wheel-chrome.png' })
})
