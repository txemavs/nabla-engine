import { test, expect } from './studio-test.js'
test('offers private generation activation when the session is absent', async ({ page }) => {
  let active = false
  await page.route('**/prepare/status', (route) =>
    route.fulfill({
      status: active ? 200 : 401,
      json: active ? { ready: 2, queued: 3 } : { error: 'Access required' },
    }),
  )
  await page.route('**/prepare/session', async (route) => {
    active = route.request().headers().authorization === 'Bearer test-owner-key'
    await route.fulfill({ status: active ? 204 : 401 })
  })
  await page.goto('/?scene=circuit')
  await page.getByRole('button', { name: 'Activar generación GLB…' }).click()
  await page.getByLabel('Clave privada de generación del servidor').fill('test-owner-key')
  await page.getByRole('button', { name: 'Activar', exact: true }).click()
  await expect(page.locator('#prepare-status')).toContainText('2 preparadas · 3 pendientes')
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-owner-key')
})
