import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
test('renders coarse surroundings with a 4.5 km far plane and no shader errors', async ({
  page,
}) => {
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
  await expect(page.locator('canvas')).toHaveAttribute('data-view-distance', '4500')
  await expect(page.locator('#draw-distance')).toBeHidden()
  await page.locator('#options-menu-button').click()
  await page.locator('#performance-section > summary').click()
  await page.locator('#map-buildings').selectOption('0')
  await page.locator('#draw-distance').selectOption('2000')
  await page.locator('#collision-distance').selectOption('200')
  await page.locator('#shadow-quality').selectOption('0')
  await page.locator('#render-resolution').selectOption('0.75')
  await expect(page.locator('canvas')).toHaveAttribute('data-view-distance', '2500')
  await page.reload()
  await page.locator('#options-menu-button').click()
  await expect(page.locator('#draw-distance')).toBeVisible()
  await expect(page.locator('#map-buildings')).toHaveValue('0')
  await expect(page.locator('#draw-distance')).toHaveValue('2000')
  await expect(page.locator('#shadow-quality')).toHaveValue('0')
  await expect(page.locator('canvas')).toHaveAttribute('data-view-distance', '2500')
  await page.mouse.move(700, 450)
  await page.mouse.wheel(0, 1200)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/distant-terrain.png' })
  expect(errors).toEqual([])
})
