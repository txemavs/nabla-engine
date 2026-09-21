import { test, expect } from '@playwright/test'
import { createGallery } from '../playground/gallery.js'
import { createEntity, parseScene } from '../src/scene.js'

test('renders PNG targets through a window and registers a shot from first person', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const entities = createGallery('test').filter((e) => !e.sprite || e.id === 'test-target-0')
  const target = entities.find((e) => e.sprite?.target)!
  target.transform.position = [-140, 0.2, -8]
  target.size = [6, 3, 0.1]
  const floor = createEntity('floor', 'box', [-1, -0.1, -1])
  floor.size = [20, 0.2, 20]
  const spawn = createEntity('spawn', 'spawn', [-1, 0.01, 0])
  const doc = parseScene({
    version: 1,
    name: 'Window gallery',
    entities: [...entities, floor, spawn],
  })
  await page.goto('/')
  await page.locator('#file').setInputFiles({
    name: 'gallery.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await expect(page.locator('canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#welcome-close').click()
  await page.locator('#play').click()
  await page.waitForTimeout(700)
  const canvas = page.locator('canvas')
  await canvas.click()
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(true)
  // Pitch upward from the default downward gaze, leaving the target in the reticle.
  await page.mouse.move(720, 360)
  await page.mouse.click(720, 360)
  await expect(page.locator('.gallery-score')).toHaveAttribute('data-hits', '1')
  await page.waitForTimeout(1800)
  await page.screenshot({ path: 'test-results/gallery-window.png' })
  await page.keyboard.press('KeyN')
  await expect(page.locator('.gallery-score')).toHaveAttribute('data-hits', '0')
  await page.keyboard.press('Tab')
  expect(errors).toEqual([])
})
