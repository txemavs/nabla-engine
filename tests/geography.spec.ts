import { test, expect } from '@playwright/test'
import { createSampleScene } from '../src/sample.js'

test('requests location, saves the GPS pin and preserves it on reload', async ({
  page,
  context,
}) => {
  await page.route(/overpass-api\.de\/|\/world-cache\/osm/, (route) =>
    route.fulfill({ json: { elements: [] } }),
  )
  await page.route(/WorldElevation3D|\/world-cache\/elevation/, (route) =>
    route.fulfill({ path: 'tests/fixtures/terrain.lerc', contentType: 'application/octet-stream' }),
  )
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 41.38, longitude: 2.17 })
  await page.goto('/?scene=circuit')
  await expect(page.locator('#latitude')).toHaveValue('41.38', { timeout: 30000 })
  await expect(page.locator('#longitude')).toHaveValue('2.17')
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  await page.reload()
  await expect(page.locator('#latitude')).toHaveValue('41.38', { timeout: 30000 })
  await page.locator('#options-menu-button').click()
  await page.locator('#geography-section > summary').click()
  await page.locator('#latitude').fill('95')
  await page.locator('#apply-location').click()
  await expect(page.locator('#toast')).toBeVisible()
  await page.reload()
  await expect(page.locator('#latitude')).toHaveValue('41.38', { timeout: 30000 })
})

test('flies from the Agency ground to space with local assets and returns to the edited scene', async ({
  page,
}) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const doc = createSampleScene()
  doc.geography!.imagery = 'offline'
  doc.entities.find((e) => e.kind === 'spawn')!.transform.position = [4, 0.1, -15]
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'planet.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#play').click()
  await page.waitForTimeout(1000)
  await page.keyboard.press('KeyE')
  await expect(page.locator('#player-mode')).toContainText('CONTAINER')
  await page.keyboard.press('KeyV')
  await page.keyboard.down('ShiftLeft')
  await page.keyboard.down('KeyW')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-geo-level', 'map', {
    timeout: 60000,
  })
  await page.screenshot({ path: 'test-results/geography-map.png' })
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-geo-level', 'space', {
    timeout: 90000,
  })
  await page.keyboard.up('KeyW')
  await page.keyboard.up('ShiftLeft')
  await expect(page.locator('#speed')).toHaveText('0 km/h', { timeout: 20000 })
  await page.screenshot({ path: 'test-results/geography-space.png' })
  // A zero reading during vertical deceleration can precede a small rebound.
  let stoppedSince = 0
  await expect
    .poll(
      async () => {
        if ((await page.locator('#speed').textContent()) !== '0 km/h') stoppedSince = 0
        else if (!stoppedSince) stoppedSince = Date.now()
        return stoppedSince > 0 && Date.now() - stoppedSince > 1500
      },
      { timeout: 20000 },
    )
    .toBe(true)
  await page.keyboard.press('KeyE')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-interior', 'carrier')
  await expect(page.locator('#player-mode')).toContainText('INTERIOR')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/carrier-orbital-interior.png' })
  await page.keyboard.press('KeyE')
  await expect(page.locator('#player-mode')).toContainText('CONTAINER')
  await page.keyboard.down('ShiftLeft')
  await page.keyboard.down('KeyW')
  await expect
    .poll(
      async () =>
        Number((await page.locator('#gps-status').textContent())?.match(/· ([\d.]+) km/)?.[1] ?? 0),
      { timeout: 60000 },
    )
    .toBeGreaterThan(10000)
  await page.keyboard.up('KeyW')
  await page.keyboard.up('ShiftLeft')
  await expect(page.locator('#speed')).toHaveText('0 km/h', { timeout: 20000 })
  await page.screenshot({ path: 'test-results/geography-earth.png' })
  await page.locator('#play').click()
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-geo-level', 'local')
  await expect(page.locator('#latitude')).toHaveValue('40.4166')
  expect(errors).toEqual([])
})

test('legacy scenes no longer request raster map tiles', async ({ page }) => {
  let requested = 0
  await page.route(
    /https:\/\/(server\.arcgisonline\.com|a\.basemaps\.cartocdn\.com)\//,
    (route) => {
      requested++
      return route.abort()
    },
  )
  await page.goto('/?scene=circuit')
  await expect(page.locator('#map-status')).toContainText('sin conexión')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  expect(requested).toBe(0)
})
