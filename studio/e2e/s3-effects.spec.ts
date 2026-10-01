import { test, expect } from '@playwright/test'

test('burnout smoke compiles with logarithmic depth and motor audio can mute', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text())
  })
  await page.route('**/s3-preview', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><button>Sound</button>' }),
  )
  await page.goto('/s3-preview')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { TireSmoke } = await import(`/@fs${root}/src/render/entity/tire-smoke.ts`)
    const { VehicleAudio } = await import(`/@fs${root}/src/audio/vehicle.ts`)
    const smoke = new TireSmoke()
    const renderer = new T.WebGLRenderer({ logarithmicDepthBuffer: true })
    renderer.setSize(300, 200)
    document.body.append(renderer.domElement)
    const scene = new T.Scene()
    scene.add(smoke.root)
    const camera = new T.PerspectiveCamera(50, 1.5, 0.1, 100)
    camera.position.set(0, 1, 4)
    camera.lookAt(0, 0, 0)
    for (let i = 0; i < 30; i++) smoke.update(1 / 60, [[0, 0, 0]], 1, new T.Vector3())
    renderer.render(scene, camera)
    const calls = renderer.info.render.calls
    const visible = smoke.root.visible
    smoke.clear()
    renderer.render(scene, camera)
    const cleared = !smoke.root.visible
    smoke.dispose()
    renderer.dispose()
    const audio = new VehicleAudio()
    document.querySelector('button')!.onclick = () => {
      audio.unlock()
      audio.powertrain(5500, 1)
      audio.setEnabled(false)
      audio.dispose()
    }
    return { calls, visible, cleared }
  }, process.cwd())
  await page.getByRole('button').click()
  expect(result).toEqual({ calls: 1, visible: true, cleared: true })
  expect(errors).toEqual([])
})
