import { createSampleScene } from '../src/sample.js'
import { test, expect } from '@playwright/test'

test('loads the original GLBs, shows the interior and keeps models after editing', async ({
  page,
}) => {
  const errors: string[] = []
  const models = new Set<string>()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.url().endsWith('.glb') && response.ok())
      models.add(response.url().split('/').pop()!)
  })
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute('data-assets', 'loaded', { timeout: 20000 })
  expect([...models]).toEqual(
    expect.arrayContaining([
      'car.audi.a3.cabrio.glb',
      'car.audi.a3.wheel.glb',
      'car.audi.a3.steering.glb',
      'ship.container.5x10.glb',
    ]),
  )
  await page.locator('#welcome-close').click()
  await page.screenshot({ path: 'test-results/a3-editor.png' })
  await page.locator('#play').click()
  await page.waitForTimeout(700)
  await page.keyboard.press('KeyE')
  await expect(page.locator('#player-mode')).toHaveText('AUDI A3 CABRIO')
  await page.screenshot({ path: 'test-results/a3-seated-driver.png' })
  await page.keyboard.press('KeyC')
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-mode', 'cockpit')
  await page.screenshot({ path: 'test-results/a3-cockpit.png' })
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(400)
  await page.keyboard.up('KeyD')
  await page.screenshot({ path: 'test-results/a3-steering.png' })
  await page.locator('#play').click()
  await expect(page.locator('canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.getByRole('treeitem', { name: /Container 5 × 10/ }).click()
  await page.locator('#focus').click()
  await page.screenshot({ path: 'test-results/container-editor.png' })
  expect(errors).toEqual([])
})

test('operates the garage latch and carrier controls in the browser', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const scene = createSampleScene()
  scene.entities.find((e) => e.id === 'car-a')!.transform.position = [4, 0.85, -9.4]
  scene.entities.find((e) => e.kind === 'spawn')!.transform.position = [2, 0.34, -9.4]
  await page.goto('/')
  await page.locator('#file').setInputFiles({
    name: 'garage.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(scene)),
  })
  await expect(page.locator('canvas')).toHaveAttribute('data-assets', 'loaded', { timeout: 20000 })
  await page.locator('#play').click()
  await page.waitForTimeout(1200)
  await page.keyboard.press('KeyE')
  await expect(page.locator('#player-mode')).toHaveText('AUDI A3 CABRIO')
  await page.keyboard.down('Space')
  await expect(page.locator('#interaction')).toContainText('F sujetar al suelo', { timeout: 10000 })
  await page.keyboard.up('Space')
  await page.keyboard.press('KeyF')
  await expect(page.locator('#player-mode')).toContainText('SUJETO')
  await page.keyboard.press('KeyT')
  await expect(page.locator('#player-mode')).toHaveText('CONTAINER 5 × 10')
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1400)
  await page.keyboard.up('KeyW')
  await expect(page.locator('#speed')).not.toHaveText('0 km/h')
  await page.screenshot({ path: 'test-results/carrier-loaded.png' })
  await page.keyboard.down('Space')
  await expect(page.locator('#speed')).toHaveText('0 km/h', { timeout: 15000 })
  await page.keyboard.up('Space')
  await page.keyboard.press('KeyT')
  await expect(page.locator('#player-mode')).toContainText('SUJETO')
  await page.keyboard.press('KeyF')
  await expect(page.locator('#player-mode')).toHaveText('AUDI A3 CABRIO')
  await page.keyboard.press('KeyC')
  await page.screenshot({ path: 'test-results/garage-cockpit.png' })
  expect(errors).toEqual([])
})
