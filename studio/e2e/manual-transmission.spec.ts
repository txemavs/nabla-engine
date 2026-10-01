import { test, expect } from './studio-test.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'

test('paddles select manual gears and B restores automatic transmission', async ({ page }) => {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [2000, 1, 2000]
  const scene = {
    version: 1,
    name: 'Driving tyre test',
    entities: [
      floor,
      presetVehicle('car', 'car', [0, 0.7, 0]),
      createEntity('spawn', 'spawn', [0, 1, 2.7]),
    ],
  }
  await page.addInitScript((doc) => {
    localStorage.setItem('nabla.scene.v1', doc)
    localStorage.setItem(
      'nabla.performance.v1',
      JSON.stringify({ resolution: 0.35, shadows: 0, mirrors: 0, dof: 0 }),
    )
    localStorage.setItem('nabla.flight-sound', 'on')
  }, JSON.stringify(scene))
  await page.goto('/')
  const canvas = page.locator('#viewport > canvas')
  await expect(canvas).toHaveAttribute('data-assets', 'loaded', { timeout: 20000 })
  if (await page.locator('#welcome-close').isVisible()) await page.locator('#welcome-close').click()
  await page.locator('#play').click()
  await expect(page.locator('#play')).toBeEnabled()
  await page.waitForTimeout(700)
  await page.keyboard.press('KeyE')
  await expect(page.locator('#player-mode')).toContainText('S3')
  await page.keyboard.press('PageUp')
  await expect(page.locator('#speed')).toContainText('M2')
  await page.waitForTimeout(150)
  await page.keyboard.press('PageDown')
  await expect(page.locator('#speed')).toContainText('M1')
  await page.keyboard.press('KeyB')
  await expect(page.locator('#speed')).toContainText('D1')
})
