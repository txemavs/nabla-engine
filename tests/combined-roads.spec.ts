import { test, expect } from '@playwright/test'
test('loads prepared combined roads and drives while preserving the source baseline', async ({
  page,
}) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/overpass-api\.de\/|\/world-cache\/osm|WorldElevation3D/, (route) =>
    route.abort(),
  )
  await page.goto('/?world=geoeuskadi')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-world', 'geoeuskadi', {
    timeout: 60000,
  })
  await expect(page.locator('#world-loading')).toBeHidden({ timeout: 60000 })
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  await expect(page.locator('#status')).toHaveText('Guardado local')
  const count = await page.evaluate(async () => {
    const module = '/scene-storage.ts'
    const { readScene } = await import(module)
    const doc = JSON.parse(await readScene('nabla.scene.v1'))
    return doc.entities.filter(
      (e: { source?: { provider: string } }) => e.source?.provider === 'geoeuskadi',
    ).length
  })
  expect(count).toBeGreaterThan(0)
  await page.reload()
  await expect(page.locator('#world-loading')).toBeHidden({ timeout: 60000 })
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded', {
    timeout: 60000,
  })
  await page.locator('#play').click()
  await expect(page.locator('#interaction')).toContainText('E para entrar', { timeout: 30000 })
  await page.keyboard.press('KeyE')
  await expect(page.locator('#player-mode')).toHaveText('AUDI A3 CABRIO')
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(2200)
  await page.keyboard.up('KeyW')
  await expect(page.locator('#speed')).not.toHaveText('0 km/h')
  await expect(page.locator('body')).toHaveClass(/playing/)
  await page.screenshot({ path: 'test-results/combined-driving.png' })
  expect(errors).toEqual([])
})
