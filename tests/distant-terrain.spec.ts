import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
test('renders coarse surroundings with a 6 km far plane and no shader errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.route(/WorldElevation3D|\/world-cache\/elevation/, (route) =>
    route.fulfill({
      path: fileURLToPath(new URL('./fixtures/terrain.lerc', import.meta.url)),
      contentType: 'application/octet-stream',
      headers: { 'access-control-allow-origin': '*' },
    }),
  )
  await page.goto('/')
  await expect(page.locator('#world-loading')).toBeHidden({ timeout: 30000 })
  await expect(page.locator('canvas')).toHaveAttribute('data-distant-terrain', 'ready', {
    timeout: 30000,
  })
  await expect(page.locator('canvas')).toHaveAttribute('data-view-distance', '6000')
  await page.mouse.move(700, 450)
  await page.mouse.wheel(0, 1200)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/distant-terrain.png' })
  expect(errors).toEqual([])
})
