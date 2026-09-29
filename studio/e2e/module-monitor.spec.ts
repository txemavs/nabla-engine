import { test, expect } from '@playwright/test'
test('standalone monitor works without loading vehicle, physics or Studio editor modules', async ({
  page,
}) => {
  const requested: string[] = []
  const errors: string[] = []
  page.on('request', (r) => requested.push(r.url()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/examples/modular-monitor.html')
  await expect(page.locator('canvas')).toHaveAttribute('data-monitor', 'ready')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('canvas')).toHaveAttribute('data-mode', 'hold')
  expect(
    requested.filter((url) =>
      /\/simulation\/|\/catalog\/vehicles\/|rapier|html-monitor|\/main\.ts/.test(url),
    ),
  ).toEqual([])
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/independent-monitor.png' })
})

test('the S3 display recipe also works on a static mount with independent keyboard actions', async ({
  page,
}) => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/examples/s3-monitor.html')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-monitor', 'ready')
  await page.locator('#speed').fill('180')
  await expect(canvas).toHaveAttribute('data-speed', '180')
  await page.locator('h1').click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(canvas).toHaveAttribute('data-mirror-tilt', '-1')
  expect(
    requests.filter((url) =>
      /\/simulation\/|\/catalog\/vehicles\/|rapier|html-monitor|\/main\.ts|\.glb/.test(url),
    ),
  ).toEqual([])
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/static-s3-monitor.png' })
})
