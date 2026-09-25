import { test, expect } from './studio-test.js'
test('the old regional entry point now uses canonical planetary streaming', async ({ page }) => {
  const keys: string[] = []
  const upstream: string[] = []
  page.on('request', (r) => {
    if (/overpass-api|world-cache\/osm/.test(r.url())) upstream.push(r.url())
  })
  await page.route('**/prepare/tiles', async (route) => {
    keys.push(...route.request().postDataJSON().keys)
    await route.fulfill({ json: { authorized: false, accepted: 0, available: {} } })
  })
  await page.route('**/ImageServer/tile/**', (r) =>
    r.fulfill({ status: 503, body: 'offline fixture' }),
  )
  await page.goto('/?world=geoeuskadi')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-world', 'destination')
  await expect.poll(() => keys.length).toBeGreaterThan(0)
  expect(keys.every((key) => /^z\/(13|14|15)\/\d+\/\d+$/.test(key))).toBe(true)
  expect(upstream).toEqual([])
  await expect(page.locator('[data-entity-id="world-terrain"]')).toHaveCount(0)
})
