import { test, expect } from '@playwright/test'
import type { Object3D } from 'three'

test('prepared Ferrari loads with independent wheels and steering and renders without WebGL errors', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/ferrari-preview', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"></body>' }),
  )
  await page.goto('/ferrari-preview')
  const result = await page.evaluate(async () => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const loader = new T.GLTFLoader()
    const base = '/library/cars/ferrari-j50/'
    const report = await fetch(base + 'asset.json').then((r) => r.json())
    const scene = new T.Scene()
    scene.background = new T.Color('#a8b6c1')
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(1440, 960)
    renderer.toneMapping = T.ACESFilmicToneMapping
    document.body.append(renderer.domElement)
    const environment = new T.PMREMGenerator(renderer).fromScene(new T.RoomEnvironment(), 0.04)
    scene.environment = environment.texture
    scene.add(new T.HemisphereLight(0xe4f0ff, 0x526049, 2))
    const sun = new T.DirectionalLight(0xffffff, 3)
    sun.position.set(-4, 8, -6)
    scene.add(sun)
    const ground = new T.Mesh(
      new T.PlaneGeometry(100, 100),
      new T.MeshStandardMaterial({ color: '#747b75', roughness: 1 }),
    )
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)
    const car = new T.Group()
    car.position.y = report.chassisHeight
    scene.add(car)
    const body = (await loader.loadAsync(base + 'j50.body.glb')).scene
    car.add(body)
    for (const role of ['fl', 'fr', 'rl', 'rr']) {
      const wheel = (await loader.loadAsync(base + `j50.wheel-${role}.glb`)).scene
      wheel.position.fromArray(report.wheelCentres[role])
      car.add(wheel)
    }
    const steering = (await loader.loadAsync(base + 'j50.steering.glb')).scene
    const anchor = body.getObjectByName('steering')!
    steering.position.copy(anchor.position)
    car.add(steering)
    const camera = new T.PerspectiveCamera(40, 1.5, 0.1, 100)
    camera.position.set(-5.8, 3.3, -6.8)
    camera.lookAt(0, 0.7, 0)
    renderer.render(scene, camera)
    Object.assign(window, { ferrariPreview: { renderer, scene, camera } })
    const meshes: string[] = []
    car.traverse((node: Object3D) => {
      if (node instanceof T.Mesh) meshes.push(node.name)
    })
    return {
      meshes: meshes.length,
      children: car.children.length,
      glError: renderer.getContext().getError(),
      bounds: new T.Box3().setFromObject(car).getSize(new T.Vector3()).toArray(),
    }
  })
  expect(errors).toEqual([])
  expect(result.glError).toBe(0)
  expect(result.children).toBe(6)
  expect(result.bounds[2]).toBeCloseTo(4.7, 1)
  await page.screenshot({ path: 'test-results/ferrari-prepared.png' })
  await page.evaluate(
    'const {renderer, scene, camera} = window.ferrariPreview; camera.position.set(5.8, 3.3, 6.8); camera.lookAt(0, 0.7, 0); renderer.render(scene,camera);',
  )
  await page.screenshot({ path: 'test-results/ferrari-prepared-rear.png' })
})
