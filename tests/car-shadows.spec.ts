import { test, expect } from '@playwright/test'

test('the A3 casts a visible ground shadow at every enabled quality', async ({ page }) => {
  await page.goto('/?scene=circuit')
  const results = await page.evaluate(async (root) => {
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const csmPath = '/csm.ts',
      assetsPath = '/assets.ts'
    const { ShadowManager } = await import(csmPath)
    const { assets } = await import(assetsPath)
    const renderer = new T.WebGLRenderer({ logarithmicDepthBuffer: true })
    renderer.setSize(256, 256)
    renderer.shadowMap.type = T.PCFShadowMap
    const scene = new T.Scene()
    const camera = new T.PerspectiveCamera(48, 1, 0.1, 4000)
    camera.position.set(7, 6, 9)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const groundMaterial = new T.MeshStandardMaterial({ color: '#cccccc' })
    const ground = new T.Mesh(new T.PlaneGeometry(100, 100), groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground, new T.HemisphereLight('#ffffff', '#888888', 0.5))
    const car = await assets.instantiate('/world/car.audi.a3.cabrio.glb')
    scene.add(car)
    const casters: import('three').Mesh[] = []
    car.traverse((node: import('three').Object3D) => {
      const object = node as import('three').Mesh
      if (!object.isMesh) return
      if (object.castShadow) casters.push(object)
      // Measure the shadow on the ground, not changes in the body's shading.
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) material.colorWrite = false
    })
    const manager = new ShadowManager()
    manager.setupMaterial(groundMaterial)
    const target = new T.WebGLRenderTarget(256, 256)
    const capture = () => {
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      const pixels = new Uint8Array(256 * 256 * 4)
      renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels)
      return pixels
    }
    const results = []
    for (const quality of [512, 1024, 2048, 0, 512]) {
      renderer.shadowMap.enabled = quality > 0
      manager.reconfigure(quality, camera, scene, new T.Vector3(1, -1.5, 0), 3.2)
      manager.update(camera, new T.Vector3())
      casters.forEach((object) => (object.castShadow = false))
      const clear = capture()
      casters.forEach((object) => (object.castShadow = true))
      const shaded = capture()
      let changed = 0
      for (let i = 0; i < clear.length; i += 4) if (clear[i] - shaded[i] > 15) changed++
      results.push({ quality, changed })
    }
    manager.dispose()
    target.dispose()
    renderer.dispose()
    return results
  }, process.cwd())
  for (const result of results) {
    if (!result.quality) expect(result.changed).toBe(0)
    else expect(result.changed).toBeGreaterThan(100)
  }
})
