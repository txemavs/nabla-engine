import { test, expect } from './studio-test.js'
import { nativeMap } from './native-map.js'
test('starts in Ventas, saves authored content without generated entities and drives on native GLBs', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await nativeMap(page)
  await page.goto('/')
  await expect(page.locator('#scene-name')).toHaveText('Irún · Ventas')
  await expect(page.locator('#world-note')).toContainText(/GLB planetarios · [1-9]/)
  await expect(page.locator('[data-entity-id="world-buildings"]')).toHaveCount(0)
  await page.locator('#name').fill('Mi A3')
  await page.locator('#name').press('Tab')
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  await expect(page.locator('#status')).toHaveText('Guardado local')
  await page.reload()
  await expect(page.locator('#name')).toHaveValue('Mi A3')
  await page.locator('#play').click()
  await expect(page.locator('#play')).toBeEnabled()
  await expect(page.locator('body')).toHaveClass(/playing/)
  await expect(page.locator('#play')).toBeEnabled()
  await page.keyboard.press('KeyE')
  await expect(page.locator('#player-mode')).toHaveText('MI A3')
  await page.keyboard.down('KeyW')
  await expect(page.locator('#speed')).not.toHaveText('0 km/h')
  await page.keyboard.up('KeyW')
  expect(errors).toEqual([])
})
