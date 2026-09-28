import { test, expect, localCircuit } from './studio-test.js'
test('quality, diagnostics, export and low resolution remain operable', async ({ page }) => {
  await localCircuit(page)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?scene=circuit')
  await page.locator('#options-menu-button').click()
  await page.getByRole('tab', { name: 'Calidad', exact: true }).click()
  await page.locator('#performance-preset').selectOption('mobile')
  await expect(page.locator('#render-resolution')).toHaveValue('0.5')
  await expect(page.locator('#depth-of-field')).toHaveValue('0')
  await expect(page.locator('#mirror-quality')).toHaveValue('0')
  await page.locator('#render-resolution').selectOption('0.35')
  await page.getByRole('tab', { name: 'Diagnóstico', exact: true }).click()
  await expect(page.locator('#diagnostics-readout')).toContainText('p99')
  await page.locator('#performance-hud-toggle').check()
  await expect(page.locator('.performance-hud')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.locator('#performance-export').click()
  expect((await download).suggestedFilename()).toBe('nabla-performance.csv')
  await page.screenshot({ path: 'test-results/performance-lab.png' })
  expect(errors).toEqual([])
})
test('touch pedals combine, release and cancel without stuck input', async ({ page }) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async () => {
    const { TouchDriving } = await import(String('/touch-driving.ts'))
    const host = document.createElement('div')
    document.body.append(host)
    const driving = new TouchDriving(host, { play: () => {}, interact: () => {}, camera: () => {} })
    driving.setActive(true)
    // Synthetic pointer capture is not allowed: use a no-op only for this input ownership unit.
    for (const button of host.querySelectorAll('button')) button.setPointerCapture = () => {}
    const press = (id: string, pointerId: number, type = 'pointerdown') =>
      host
        .querySelector(`[data-drive="${id}"]`)!
        .dispatchEvent(new PointerEvent(type, { pointerId, bubbles: true }))
    press('forward', 1)
    press('left', 2)
    const combined = driving.input()
    press('forward', 1, 'pointercancel')
    const cancelled = driving.input()
    window.dispatchEvent(new Event('blur'))
    const cleared = driving.input()
    host.remove()
    return { combined, cancelled, cleared }
  })
  expect(result.combined).toEqual({ forward: 1, right: -1, brake: false })
  expect(result.cancelled.forward).toBe(0)
  expect(result.cleared.right).toBe(0)
})

test('an ordinary phone gets a full-width viewport, touch controls and mobile defaults', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  await localCircuit(page)
  await page.goto('/')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-startup', 'ready', {
    timeout: 30000,
  })
  await expect(page.locator('.touch-driving')).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-layout.png' })
  await expect(page.locator('#viewport')).toBeVisible()
  const box = await page.locator('#viewport').boundingBox()
  expect(box!.width).toBeGreaterThan(360)
  await page.locator('#options-menu-button').click()
  await expect(page.locator('#performance-preset')).toHaveValue('mobile')
  await expect(page.locator('#render-resolution')).toHaveValue('0.5')
  await expect(page.locator('#performance-preset')).toBeVisible()
  const select = await page.locator('#performance-preset').boundingBox()
  expect(select!.x + select!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/performance-mobile.png' })
  await context.close()
})
