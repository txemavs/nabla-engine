import { createEntity } from '../src/scene.js'
import { test, expect } from './studio-test.js'

test('adds complete catalogue entities and saves editable lamp settings', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?scene=circuit')
  if (await page.locator('#welcome-close').isVisible()) await page.locator('#welcome-close').click()
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [200, 1, 200]
  await page.locator('#file').setInputFiles({
    name: 'catalog.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: 'Catalogue',
        sky: { mode: 'fixed', at: '2026-09-22T00:00:00Z' },
        entities: [floor, createEntity('spawn', 'spawn', [0, 0.1, 0])],
      }),
    ),
  })
  for (const kind of ['car', 'carrier', 'streetlight']) {
    await page.locator('#add-entity').click()
    await page.locator(`#add-${kind}`).click()
    await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
    await expect(page.locator('.entity-capabilities')).toContainText(
      kind === 'streetlight' ? 'light' : 'drive',
    )
  }
  await page.getByLabel('Posición respecto al padre · m X', { exact: true }).fill('18')
  await page.getByLabel('Posición respecto al padre · m X', { exact: true }).press('Tab')
  await page.locator('#focus').click()
  await page.locator('#light-night').uncheck()
  await page.locator('#light-intensity').fill('2400')
  await page.locator('#light-intensity').press('Tab')
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  const lamps = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('nabla.scene.v1')!).entities.filter(
      (e: { light?: unknown }) => e.light,
    ),
  )
  expect(lamps).toHaveLength(1)
  expect(lamps[0].light).toMatchObject({ nightOnly: false, intensity: 2400 })
  await page.screenshot({ path: 'test-results/catalog-lamp.png' })
  expect(errors).toEqual([])
})
