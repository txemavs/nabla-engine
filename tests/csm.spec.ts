import { test, expect } from '@playwright/test'

test('switches shadow quality without shader errors and renders the city', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /shader|WebGL|THREE/i.test(message.text()))
      errors.push(message.text())
  })
  await page.addInitScript(() => {
    localStorage.setItem('nabla.location.requested', '1')
    localStorage.setItem('nabla.performance.v1', JSON.stringify({ shadows: 512 }))
  })
  await page.goto('/')
  await expect(page.locator('#world-loading')).toBeHidden({ timeout: 30000 })
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded', {
    timeout: 30000,
  })
  await page.mouse.move(750, 400)
  await page.mouse.wheel(0, 700)
  await page.waitForTimeout(500)
  await page.locator('#options-menu-button').click()
  await page.locator('#sky-section > summary').click()
  await page.locator('#sky-time').fill('2026-09-21T17:30')
  await page.locator('#sky-apply').click()
  await page.locator('#performance-section > summary').click()
  // Options are global, independent of the selected entity.
  for (const [quality, count] of [
    ['0', '0'],
    ['512', '1'],
    ['1024', '2'],
    ['2048', '3'],
    ['512', '1'],
  ]) {
    await page.locator('#shadow-quality').selectOption(quality)
    await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-shadow-cascades', count)
    await page.waitForTimeout(300)
    await page.keyboard.press('Escape')
    await page.screenshot({ path: `test-results/csm-city-${quality}.png` })
    await page.locator('#options-menu-button').click()
  }
  await page.keyboard.press('Escape')
  await page.mouse.move(750, 400)
  await page.mouse.wheel(0, 1000)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/csm-city-low.png' })
  expect(errors).toEqual([])
})
