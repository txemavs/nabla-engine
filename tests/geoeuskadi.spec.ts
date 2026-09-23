import { test, expect } from '@playwright/test'

test('compares cached official surfaces with OSM without querying either provider', async ({
  page,
}) => {
  const errors: string[] = []
  const remote: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:'))
      remote.push(request.url())
  })
  await page.goto('/geoeuskadi.html')
  const view = page.locator('#viewport')
  await expect(view).toHaveAttribute('data-ready', 'true')
  await expect(view).toHaveAttribute('data-provider', 'official')
  await expect(view).toHaveAttribute('data-draw-calls', '2')
  await page.locator('#osm').click()
  await expect(view).toHaveAttribute('data-provider', 'osm')
  await expect(page.locator('#official')).toHaveAttribute('aria-pressed', 'false')
  await page.locator('#buildings').check()
  await expect(view).toHaveAttribute('data-draw-calls', '3')
  await page.locator('#top').click()
  await page.locator('#oblique').click()
  await page.locator('#official').click()
  await expect(view).toHaveAttribute('data-provider', 'official')
  expect(remote).toEqual([])
  expect(errors).toEqual([])
})

test('does not render a corrupted comparison pack', async ({ page }) => {
  await page.route('**/pilot-*.pack', (route) =>
    route.fulfill({ body: 'corrupt', contentType: 'application/octet-stream' }),
  )
  await page.goto('/geoeuskadi.html')
  await expect(page.locator('#status')).toContainText('La geometría no coincide')
  await expect(page.locator('canvas')).toHaveCount(0)
})
