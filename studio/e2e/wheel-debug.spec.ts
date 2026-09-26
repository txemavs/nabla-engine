import { test, expect } from './studio-test.js'
test('wheel diagnostics compare render-space GLBs with physics after an origin shift', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const module = '/wheel-debug.ts'
    const { WheelDebugOverlay } = await import(module)
    const overlay = new WheelDebugOverlay()
    const plane = new T.Mesh(
      new T.PlaneGeometry(20, 20),
      new T.MeshBasicMaterial({ side: T.DoubleSide }),
    )
    plane.rotation.x = -Math.PI / 2
    plane.position.set(20, 0.25, 0)
    const sim = {
      wheelContactInfo: () => [{ contactPoint: [10020, 0, 20000], isInContact: true }],
      wheelTransforms: () => [{ position: [10020, 1, 20000] }],
    }
    overlay.setTerrainMeshes([plane])
    overlay.toggle()
    overlay.update(sim, 'car', new T.Vector3(10000, 0, 20000))
    const delta = overlay.data[0].delta
    overlay.toggle()
    const hidden = !overlay.root.visible && overlay.formatHud() === ''
    overlay.dispose()
    plane.geometry.dispose()
    plane.material.dispose()
    return { delta, hidden }
  }, process.cwd())
  expect(result.delta).toBeCloseTo(0.25)
  expect(result.hidden).toBe(true)
})
