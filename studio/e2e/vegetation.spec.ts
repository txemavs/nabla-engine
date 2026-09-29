import { test, expect } from '@playwright/test'

test('streamed trees retain their crown width from both sides in one instanced draw', async ({
  page,
}) => {
  await page.route('**/trees-preview', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0"></body>' }),
  )
  await page.goto('/trees-preview')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { treeInstances } = await import(`/@fs${root}/src/render/planet/vegetation.ts`)
    const texture = await new T.TextureLoader().loadAsync('/sprites/tree.png')
    texture.colorSpace = T.SRGBColorSpace
    const material = new T.MeshStandardMaterial({
      map: texture,
      alphaTest: 0.4,
      side: T.DoubleSide,
      roughness: 1,
    })
    const trees = treeInstances(
      [
        { position: [-7, 0, 0], size: [6, 9] },
        { position: [0, 0, 0], size: [6, 9] },
        { position: [7, 0, 0], size: [6, 9] },
      ],
      material,
    )
    const scene = new T.Scene()
    scene.background = new T.Color('#bfd0dc')
    scene.add(trees)
    scene.add(new T.HemisphereLight(0xffffff, 0x64744c, 2))
    const sun = new T.DirectionalLight(0xffffff, 2)
    sun.position.set(6, 9, 5)
    scene.add(sun)
    const camera = new T.PerspectiveCamera(45, 1.5, 0.1, 100)
    camera.position.set(18, 6, 23)
    camera.lookAt(0, 4, 0)
    const renderer = new T.WebGLRenderer({ antialias: true })
    renderer.setSize(900, 600)
    document.body.append(renderer.domElement)
    renderer.render(scene, camera)
    ;(window as unknown as { treeTop: () => void }).treeTop = () => {
      camera.position.set(0, 32, 0)
      camera.up.set(0, 0, -1)
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
    }
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
  }, process.cwd())
  expect(result.calls).toBe(1)
  expect(result.triangles).toBe(48)
  await page.screenshot({ path: 'test-results/trees-corrected.png' })
  await page.evaluate(() => (window as unknown as { treeTop: () => void }).treeTop())
  await page.screenshot({ path: 'test-results/trees-top.png' })
})
