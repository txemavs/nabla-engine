import { test, expect } from '@playwright/test'
import { createEntity } from '../src/scene.js'

test('opaque PNG pixels occlude deeper sprites regardless of draw order and match shot hits', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const entities = [
    createEntity('spawn', 'spawn', [0, 0, 0]),
    ...['near', 'far'].map((id, i) => ({
      ...createEntity(id, 'group', [0, -1, -3 - i * 2]),
      size: [2, 2, 0.1],
      sprite: { url: '/sprites/target.png' },
    })),
  ]
  const results = await page.evaluate(async (entities) => {
    const threePath = performance
      .getEntriesByType('resource')
      .find((entry) => /\/three\.js(?:\?|$)/.test(entry.name))?.name
    if (!threePath) throw new Error('The app did not load Three.js')
    const viewPath = '/view.ts'
    const T = await import(threePath),
      { SceneView } = await import(viewPath)
    const view = new SceneView({ version: 1, name: 'Depth', entities })
    await view.ready
    view.objects.get('spawn').visible = false
    const renderer = new T.WebGLRenderer({
      preserveDrawingBuffer: true,
      logarithmicDepthBuffer: true,
    })
    renderer.setSize(64, 64)
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(55, 1, 0.01, 100)
    scene.add(view.root)
    view.sprites.get('near').material.color.setHex(0x00ff00)
    view.sprites.get('far').material.color.setHex(0xff0000)
    const output = []
    for (const order of [-10, 10]) {
      view.sprites.get('far').renderOrder = order
      for (const x of [-0.15, 0, 0.15]) {
        camera.position.set(x, 0.1, 0)
        camera.lookAt(0, 0, -3)
        renderer.render(scene, camera)
        const pixel = new Uint8Array(4),
          gl = renderer.getContext()
        gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
        const ray = new T.Raycaster()
        ray.setFromCamera(new T.Vector2(), camera)
        output.push({ pixel: [...pixel], hit: view.hitSprite(ray)?.object.userData.entityId })
      }
    }
    view.dispose()
    renderer.dispose()
    return output
  }, entities)
  for (const result of results) {
    expect(result.pixel[0]).toBeLessThan(5)
    expect(result.pixel[1]).toBeGreaterThan(20)
    expect(result.hit).toBe('near')
  }
})
