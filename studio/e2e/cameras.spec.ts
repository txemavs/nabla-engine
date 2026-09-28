import { test, expect } from './studio-test.js'

test('cycles chase, cockpit and vehicle-up overhead map with adjustable height', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() =>
    localStorage.setItem(
      'nabla.performance.v1',
      JSON.stringify({ resolution: 0.35, shadows: 0, mirrors: 0, dof: 0 }),
    ),
  )
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
  await page.keyboard.press('KeyJ')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-camera-mode', 'cockpit')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(
    page.getByText('Color aplicado · Guardar conserva el cambio', { exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/car-menu-cockpit.png' })
  await page.keyboard.press('KeyJ')
  // Restore chase before testing the ordinary C cycle.
  await page.keyboard.press('KeyC')
  await page.keyboard.press('KeyC')

  await page.keyboard.press('KeyC')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-camera-mode', 'cockpit')
  await page.keyboard.press('KeyC')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-camera-mode', 'map')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-map-height', '45')
  await page.locator('#viewport > canvas').hover()
  await page.mouse.wheel(0, 300)
  await expect(page.locator('#viewport > canvas')).not.toHaveAttribute('data-map-height', '45')
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
