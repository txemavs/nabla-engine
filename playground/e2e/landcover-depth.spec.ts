import { test, expect } from './studio-test.js'
test('overlapping land paint stays stable while terrain and roads retain depth', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const module = '/tile-asset.ts'
    const { restoreTileLayers } = await import(module)
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const renderer = new T.WebGLRenderer({ antialias: false })
    renderer.setSize(64, 64)
    const target = new T.WebGLRenderTarget(64, 64)
    const scene = new T.Scene()
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 20)
    camera.position.z = 5
    const add = (category: string, layer: number, z: number, color: number, size = 2) => {
      const mesh = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ color }))
      mesh.position.z = z
      mesh.userData = { category, groundLayer: layer }
      scene.add(mesh)
      restoreTileLayers(mesh)
      return mesh
    }
    const ground = add('Terrain', 0, 0, 0x444444)
    const brown = add('Surfaces', 4, 0.03, 0xff0000)
    const green = add('Surfaces', 5, 0.02, 0x00ff00)
    const road = add('Roads', 13, 0.05, 0x0000ff, 0.5)
    const sample = (x: number, y: number) => {
      const a = new Uint8Array(4)
      renderer.readRenderTargetPixels(target, x, y, 1, 1, a)
      return Array.from(a).slice(0, 3)
    }
    const corners = []
    for (const angle of [-0.05, 0, 0.05]) {
      brown.rotation.y = angle
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      corners.push(sample(48, 32))
    }
    const center = sample(32, 32)
    const writes = [
      ground.material.depthWrite,
      brown.material.depthWrite,
      green.material.depthWrite,
      road.material.depthWrite,
    ]
    scene.traverse((m: any) => {
      if (m.isMesh) {
        m.geometry.dispose()
        m.material.dispose()
      }
    })
    target.dispose()
    renderer.dispose()
    return { corners, center, writes }
  }, process.cwd())
  expect(result.corners).toEqual([
    [0, 255, 0],
    [0, 255, 0],
    [0, 255, 0],
  ])
  expect(result.center).toEqual([0, 0, 255])
  expect(result.writes).toEqual([true, false, false, true])
})
