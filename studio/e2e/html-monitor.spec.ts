import { test, expect } from '@playwright/test'

test('editable HTML monitor renders live data into an untainted WebGL texture', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (event) => {
    if (event.type() === 'error') errors.push(event.text())
  })
  await page.goto('/monitors/html-panel.example.html')
  await page.locator('#demo-speed').fill('150')
  await expect(page.locator('[data-value="speed"]')).toHaveText('150')
  await page.screenshot({ path: 'test-results/speedometer-template.png' })
  const result = await page.evaluate(async (root) => {
    const { HtmlMonitor } = await import(`/@fs${root}/src/render/monitors/html-monitor.ts`)
    const T = await import(String('/e2e/render-fixture.ts'))
    const monitor = new HtmlMonitor('/monitors/html-panel.example.html')
    await monitor.ready
    monitor.update(
      {
        values: { speed: 250, rpm: 6200, gear: 'D6', throttle: '100 %' },
        bars: { speed: 250 / 320, rpm: 6200 / 7000, throttle: 1 },
      },
      performance.now(),
    )
    const ctx = monitor.canvas.getContext('2d')!
    for (let i = 0; i < 100 && ctx.getImageData(30, 30, 1, 1).data[3] === 0; i++)
      await new Promise((resolve) => setTimeout(resolve, 20))
    const initial = monitor.diagnostics.renders
    const unchanged = {
      values: { speed: 250, rpm: 6200, gear: 'D6', throttle: '100 %', unused: 'ignored' },
      bars: { speed: 250 / 320 + 0.00001, rpm: 6200 / 7000, throttle: 1 },
    }
    monitor.update(unchanged, performance.now() + 1000)
    const unchangedRenders = monitor.diagnostics.renders
    const skipped = monitor.diagnostics.skipped
    monitor.setInterval(500)
    const primaryInterval = monitor.effectiveInterval
    monitor.setSecondary(true)
    const secondaryInterval = monitor.effectiveInterval
    const pixels = ctx.getImageData(0, 0, 640, 320).data
    let red = 0,
      white = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 180 && pixels[i + 1] < 100) red++
      if (pixels[i] > 200 && pixels[i + 1] > 200 && pixels[i + 2] > 200) white++
    }
    const renderer = new T.WebGLRenderer()
    renderer.setSize(640, 320)
    document.body.replaceChildren(renderer.domElement)
    const scene = new T.Scene()
    const camera = new T.PerspectiveCamera(45, 2, 0.1, 10)
    camera.position.z = 2.5
    const material = new T.MeshBasicMaterial({ map: monitor.texture })
    const geometry = new T.PlaneGeometry(2, 1)
    scene.add(new T.Mesh(geometry, material))
    renderer.render(scene, camera)
    const calls = renderer.info.render.calls
    monitor.dispose()
    material.dispose()
    geometry.dispose()
    renderer.dispose()
    return {
      red,
      white,
      calls,
      initial,
      unchangedRenders,
      skipped,
      primaryInterval,
      secondaryInterval,
    }
  }, process.cwd())
  expect(result.initial).toBe(1)
  expect(result.unchangedRenders).toBe(1)
  expect(result.skipped).toBe(1)
  expect(result.primaryInterval).toBeGreaterThanOrEqual(500)
  expect(result.secondaryInterval).toBeGreaterThan(result.primaryInterval)
  expect(result.red).toBeGreaterThan(3000)
  expect(result.white).toBeGreaterThan(1000)
  expect(result.calls).toBe(1)
  expect(errors).toEqual([])
})
