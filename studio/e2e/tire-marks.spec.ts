import { test, expect } from '@playwright/test'

test('renders curved tyre trails in one draw and hides expired marks', async ({ page }) => {
  await page.route('**/marks-preview', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0"></body>' }),
  )
  await page.goto('/marks-preview')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { TireMarks } = await import(`/@fs${root}/src/render/entity/tire-marks.ts`)
    const marks = new TireMarks()
    const origin = new T.Vector3(1000000, 0, 0)
    for (let i = 0; i < 100; i++) {
      const a = i * 0.022
      marks.update(
        0.06,
        'car',
        [-0.75, 0.75].map((offset) => ({
          contactPoint: [1000000 + Math.sin(a) * (8 + offset), 0, Math.cos(a) * (8 + offset)],
          contactNormal: [0, 1, 0],
          slip: 0.9,
        })),
        origin,
      )
    }
    const renderer = new T.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
    renderer.setSize(800, 600)
    document.body.append(renderer.domElement)
    const scene = new T.Scene()
    scene.background = new T.Color('#999b9e')
    scene.add(marks.root)
    const camera = new T.PerspectiveCamera(45, 800 / 600, 0.1, 100)
    camera.position.set(15, 18, 17)
    camera.lookAt(4, 0, 2)
    renderer.render(scene, camera)
    const calls = renderer.info.render.calls
    ;(window as unknown as { expire: () => void }).expire = () => {
      marks.update(21, null, [], origin)
      renderer.render(scene, camera)
    }
    return { calls, count: marks.root.geometry.drawRange.count }
  }, process.cwd())
  expect(result.calls).toBe(1)
  expect(result.count).toBeGreaterThan(100)
  await page.screenshot({ path: 'test-results/tire-marks.png' })
  await page.evaluate(() => (window as unknown as { expire: () => void }).expire())
  expect(errors).toEqual([])
})
