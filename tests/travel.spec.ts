import { test, expect } from '@playwright/test'

test('travels to another city with its own terrain, saves it and can undo the trip', async ({
  page,
}) => {
  let queries = 0
  await page.route(/overpass-api\.de\/|\/world-cache\/osm/, (route) => {
    queries++
    return route.fulfill({
      json: {
        elements: [
          {
            type: 'way',
            id: 987654,
            tags: { building: 'yes' },
            geometry: [
              { lat: 40.4175, lon: -3.7031 },
              { lat: 40.4175, lon: -3.7029 },
              { lat: 40.4177, lon: -3.7029 },
              { lat: 40.4177, lon: -3.7031 },
              { lat: 40.4175, lon: -3.7031 },
            ],
          },
        ],
      },
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await page.route(/WorldElevation3D|\/world-cache\/elevation/, (route) =>
    route.fulfill({
      path: 'tests/fixtures/terrain.lerc',
      contentType: 'application/octet-stream',
      headers: { 'access-control-allow-origin': '*' },
    }),
  )
  await page.goto('/?scene=circuit')
  const before = await page.locator('#scene-name').textContent()
  await page.locator('#travel-menu-button').click()
  await page.locator('#travel-city').selectOption('40.4168,-3.7038')
  await page.locator('#travel-go').click()
  await expect(page.locator('canvas')).toHaveAttribute('data-world', 'destination', {
    timeout: 30000,
  })
  await expect(page.locator('#scene-name')).toHaveText('Madrid · Sol')
  await expect(page.locator('[data-entity-id="world-terrain"]')).toHaveCount(1)
  await expect(page.locator('#latitude')).toHaveValue('40.4168')
  await expect(page.locator('#world-note')).toContainText('Madrid')
  await expect(page.locator('#travel-menu')).toBeHidden()
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  await expect(page.locator('#status')).toHaveText('Guardado local')
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('nabla.scene.v1')!).entities.some(
        (e: { source?: { id: string } }) => e.source?.id === 'way/987654',
      ),
    ),
  ).toBe(true)
  await page.locator('#undo').click()
  await expect(page.locator('#scene-name')).toHaveText(before!)
  await page.locator('#redo').click()
  await expect(page.locator('#scene-name')).toHaveText('Madrid · Sol')
  await page.screenshot({ path: 'test-results/travel-madrid.png' })
  await page.reload()
  await expect(page.locator('#scene-name')).toHaveText('Madrid · Sol')
  expect(queries).toBe(1)
})

test('preserves the scene on destination failure and cancellation; validates coordinates', async ({
  page,
}) => {
  await page.route(/overpass-api\.de\/|\/world-cache\/osm/, (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  )
  await page.goto('/?scene=circuit')
  const before = await page.locator('#scene-name').textContent()
  await page.locator('#travel-menu-button').click()
  await page.locator('#travel-latitude').fill('91')
  await page.locator('#travel-go').click()
  await expect(page.locator('#world-loading')).toBeHidden()
  await page.locator('#travel-latitude').fill('52.5163')
  await page.locator('#travel-longitude').fill('13.3777')
  await page.locator('#travel-go').click()
  await expect(page.locator('#travel-status')).toContainText('No se pudo cargar', {
    timeout: 15000,
  })
  await expect(page.locator('#scene-name')).toHaveText(before!)
  await page.unroute(/overpass-api\.de\/|\/world-cache\/osm/)
  await page.route(/overpass-api\.de\/|\/world-cache\/osm/, async (route) => {
    await new Promise((r) => setTimeout(r, 3000))
    await route.fulfill({ json: { elements: [] } }).catch(() => {})
  })
  await page.locator('#travel-go').click()
  await page.locator('#travel-cancel').click()
  await expect(page.locator('#travel-status')).toContainText('Viaje cancelado')
  await expect(page.locator('#world-loading')).toBeHidden()
  await expect(page.locator('#scene-name')).toHaveText(before!)
})
