import { expect, test } from '@playwright/test'

test('production page loads the real car, renders diagnostics and explains unavailable XR', async ({
  page,
}) => {
  const errors: string[] = []
  const ranges: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
    if (response.url().endsWith('.pak') && response.status() === 206)
      ranges.push(response.request().headers().range)
  })
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { value: undefined }))
  await page.goto('/xr-demo.html')
  await expect(page.getByRole('status', { name: 'Estado de VR' })).toContainText('Coche listo')
  await expect(page.getByRole('status', { name: 'Estado de VR' })).toContainText('Quest Browser')
  await expect(page.getByRole('button', { name: 'Entrar en VR' })).toBeDisabled()
  await expect(page.getByLabel('Rendimiento')).toContainText('callbacks/s')
  const indexResponse = await page.request.get('/packs/index.json')
  expect(indexResponse.ok()).toBe(true)
  const index = await indexResponse.json()
  for (const path of [
    '/library/cars/a3/a3.cabrio.glb',
    '/library/cars/a3/a3.wheel.glb',
    '/library/weapons/hk-compact/hk-compact.glb',
  ]) {
    const entry = index.entries[path]
    expect(entry).toBeDefined()
    expect(ranges).toContain(`bytes=${entry.offset}-${entry.offset + entry.length - 1}`)
  }
  // Desktop controls still work on the preview canvas.
  await page.mouse.move(1050, 600)
  await page.mouse.down()
  await page.mouse.move(1150, 620, { steps: 5 })
  await page.mouse.up()
  await page.screenshot({ path: 'test-results/quest-desktop.png' })
  expect(errors).toEqual([])
})

test('denied immersive permission is shown and can be requested again', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'xr', {
      value: {
        isSessionSupported: async () => true,
        requestSession: async () => {
          throw new DOMException('Permission denied', 'NotAllowedError')
        },
      },
    })
  })
  await page.goto('/xr-demo.html')
  const enter = page.getByRole('button', { name: 'Entrar en VR' })
  await expect(enter).toBeEnabled()
  for (let attempt = 0; attempt < 2; attempt++) {
    await enter.click()
    await expect(page.getByRole('status', { name: 'Estado de VR' })).toContainText(
      'Permission denied',
    )
    await expect(enter).toBeEnabled()
  }
  await expect(page.getByRole('button', { name: 'Salir de VR' })).toBeDisabled()
})
