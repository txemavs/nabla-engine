import { test, expect } from './studio-test.js'
import { createOutboard } from '../../src/catalog/boat.js'
import { createEntity } from '../../src/stage/scene.js'
test('F8 runs gravity and E boards, leaves and reboards the boat', async ({ page }) => {
  const scene = {
    version: 1,
    name: 'Boat boarding',
    entities: [createEntity('spawn', 'spawn', [0, 5, 1.6]), createOutboard('boat', [0, 0.2, 0])],
  }
  await page.addInitScript(
    (scene) => localStorage.setItem('nabla.scene.v1', JSON.stringify(scene)),
    scene,
  )
  await page.goto('/?scene=circuit')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#play').click()
  await expect(page.locator('#play')).toBeEnabled()
  await expect(page.locator('#interaction')).toContainText('E para entrar en Fueraborda', {
    timeout: 15000,
  })
  await page.locator('#viewport > canvas').click({ position: { x: 200, y: 150 } })
  await page.keyboard.press('KeyE')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-vehicle', 'boat')
  await page.keyboard.press('KeyE')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-vehicle', '')
  await expect(page.locator('#interaction')).toContainText('E para entrar')
  await page.keyboard.press('KeyE')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-vehicle', 'boat')
})
