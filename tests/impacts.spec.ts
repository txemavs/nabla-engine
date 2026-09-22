import { test, expect } from '@playwright/test'
import { createEntity } from '../src/scene.js'

test('leaves visible persistent surface marks and clears them when play stops', async ({
  page,
}) => {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [30, 1, 30]
  const wall = createEntity('wall', 'box', [0, 2, 0])
  wall.size = [8, 4, 0.5]
  wall.color = '#eee8dd'
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'impacts.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: 'Impacts',
        entities: [floor, wall, createEntity('spawn', 'spawn', [0, 0.1, 5])],
      }),
    ),
  })
  await page.locator('#play').click()
  await page.keyboard.press('Tab')
  await page.locator('#viewport > canvas').click()
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(true)
  await page.mouse.click(700, 450)
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-impacts', '1')
  await page.waitForTimeout(260)
  await page.mouse.move(735, 450)
  await page.mouse.click(735, 450)
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-impacts', '2')
  await page.mouse.move(800, 450)
  await page.waitForTimeout(1000)
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-impacts', '2')
  await page.screenshot({ path: 'test-results/impact-marks.png' })
  await page.keyboard.press('F8')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-impacts', '0')
})
