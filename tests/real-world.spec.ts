import { test, expect } from '@playwright/test'
test('starts in Ventas, edits and saves an OSM building and drives the A3', async ({ page }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/overpass-api\.de\/|\/world-cache\/osm/, (route) =>
    route.fulfill({
      status: 503,
      body: 'Offline test',
      headers: { 'access-control-allow-origin': '*' },
    }),
  )
  await page.route(/WorldElevation3D|\/world-cache\/elevation/, (route) => route.abort())
  await page.goto('/')
  await expect(page.locator('#scene-name')).toHaveText('Irún · Ventas / Katea', { timeout: 30000 })
  await expect(page.locator('#world-loading')).toBeHidden({ timeout: 30000 })
  await expect(page.locator('#latitude')).toHaveValue('43.32969')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.screenshot({ path: 'test-results/irun-world.png' })
  await page.locator('[data-entity-id="world-buildings"]').click()
  const building = page.locator('#tree [data-entity-id^="osm-way-"]').first()
  const id = await building.getAttribute('data-entity-id')
  await building.click()
  await page.locator('#make-building-editable').click()
  await page.locator('#color').evaluate((el: HTMLInputElement) => {
    el.value = '#7199bc'
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  await expect(page.locator('#status')).toHaveText('Guardado local')
  await page.reload()
  await expect(page.locator('#world-note')).toBeVisible()
  await page.locator('[data-entity-id="world-buildings"]').click()
  await page.locator(`[data-entity-id="${id}"]`).click()
  await expect(page.locator('#color')).toHaveValue('#7199bc')
  await page.locator('#play').click()
  await expect(page.locator('#interaction')).toContainText('E para entrar', { timeout: 15000 })
  await page.keyboard.press('KeyE')
  await expect(page.locator('#player-mode')).toHaveText('AUDI A3 CABRIO')
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(2200)
  await page.keyboard.up('KeyW')
  await expect(page.locator('#speed')).not.toHaveText('0 km/h')
  await page.screenshot({ path: 'test-results/irun-driving.png' })
  expect(errors).toEqual([])
})
