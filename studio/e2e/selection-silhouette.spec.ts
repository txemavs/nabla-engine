import { test, expect } from './studio-test.js'

test('selection draws only the mesh-union perimeter, retains renderer state and follows poses', async ({
  page,
}) => {
  await page.route('**/selection-preview', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/selection-preview')
  const result = await page.evaluate(async () => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { SelectionSilhouette } = await import(String('/selection-silhouette.ts'))
    const renderer = new T.WebGLRenderer({ antialias: false })
    renderer.setSize(128, 128)
    renderer.setPixelRatio(1)
    renderer.setClearColor(0x000000, 1)
    const target = new T.WebGLRenderTarget(128, 128)
    const scene = new T.Scene(),
      group = new T.Group()
    const material = new T.MeshBasicMaterial({ color: 0x224488 })
    const geometry = new T.BoxGeometry(1, 1, 0.2)
    const left = new T.Mesh(geometry, material),
      right = new T.Mesh(geometry, material)
    left.position.set(-0.35, 0.3, 0)
    right.position.set(0.35, -0.3, 0)
    group.add(left, right)
    scene.add(group)
    const camera = new T.OrthographicCamera(-2, 2, 2, -2, 0.1, 20)
    camera.position.z = 5
    const effect = new SelectionSilhouette()
    const pixels = new Uint8Array(128 * 128 * 4)
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels)
    const before = pixels.slice()
    effect.render(renderer, camera, group)
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels)
    const yellow = (x: number, y: number) => {
      const i = (y * 128 + x) * 4
      return pixels[i] > 180 && pixels[i + 1] > 130 && pixels[i + 2] < 100
    }
    let yellowCount = 0,
      interiorChanges = 0
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        if (yellow(x, y)) yellowCount++
        const i = (y * 128 + x) * 4
        if (before[i + 2] > 100 && pixels[i + 2] !== before[i + 2]) interiorChanges++
      }
    // Empty corner of the bounding box must not acquire a yellow rectangle.
    const emptyCorner = yellow(37, 39)
    const image = pixels.slice()
    group.position.set(10000, 0, 0)
    camera.position.x = 10000
    renderer.autoClear = true
    renderer.render(scene, camera)
    effect.render(renderer, camera, group)
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels)
    const follows = image.every((value, index) => Math.abs(value - pixels[index]) <= 2)
    const standard = new T.MeshStandardMaterial()
    left.material = standard
    right.material = standard
    left.visible = false
    right.visible = false
    renderer.autoClear = true
    renderer.clear()
    effect.render(renderer, camera, group, true)
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels)
    const batchedOutline = pixels.some((value, index) => index % 4 === 0 && value > 180)
    left.material = material
    right.material = material
    const intact =
      left.parent === group && left.material === material && right.geometry === geometry
    const state =
      renderer.getRenderTarget() === target && renderer.getClearAlpha() === 1 && renderer.autoClear
    effect.dispose()
    effect.dispose()
    target.dispose()
    geometry.dispose()
    material.dispose()
    standard.dispose()
    renderer.dispose()
    return { yellowCount, interiorChanges, emptyCorner, follows, intact, state, batchedOutline }
  })
  expect(result.yellowCount).toBeGreaterThan(100)
  expect(result.interiorChanges).toBe(0)
  expect(result.emptyCorner).toBe(false)
  expect(result.follows).toBe(true)
  expect(result.intact).toBe(true)
  expect(result.state).toBe(true)
  expect(result.batchedOutline).toBe(true)
})
