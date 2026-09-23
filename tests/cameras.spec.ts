import { test, expect } from './studio-test.js'

test('cycles chase, cockpit and north-up overhead map with adjustable height', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?scene=circuit')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded', {
    timeout: 20000,
  })
  if (await page.locator('#welcome-close').isVisible()) await page.locator('#welcome-close').click()
  await page.locator('#play').click()
  await expect(page.locator('#play')).toBeEnabled()
  await page.waitForTimeout(700)
  await page.keyboard.press('KeyE')
  await expect(page.locator('#player-mode')).toContainText('AUDI')
  await page.keyboard.press('KeyC')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-camera-mode', 'cockpit')
  await page.keyboard.press('KeyC')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-camera-mode', 'map')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-map-height', '350')
  await page.locator('#viewport > canvas').hover()
  await page.mouse.wheel(0, 300)
  await expect(page.locator('#viewport > canvas')).not.toHaveAttribute('data-map-height', '350')
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1800)
  await page.keyboard.up('KeyW')
  await expect(page.locator('#speed')).not.toHaveText('0 km/h')
  await page.screenshot({ path: 'test-results/camera-map.png' })
  await page.keyboard.press('KeyC')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-camera-mode', 'chase')
  await page.locator('#play').click()
  await expect(page.locator('#play')).toBeEnabled()
  expect(errors).toEqual([])
})
