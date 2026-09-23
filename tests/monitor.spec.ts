import { test, expect } from '@playwright/test'

test('starts in first person, toggles monitor view and fires only in play with captured mouse', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?scene=circuit')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded', {
    timeout: 20000,
  })
  await page.locator('#welcome-close').click()
  await page.locator('#play').click()
  const canvas = page.locator('#viewport > canvas'),
    reticle = page.getByLabel('Punto de mira')
  await expect(canvas).toHaveAttribute('data-camera-mode', 'first-person')
  await expect(reticle).toBeHidden()
  await page.keyboard.press('Tab')
  await expect(reticle).toBeVisible()
  await expect(reticle).toHaveAttribute('data-weapon', 'loaded')
  await canvas.click()
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(true)
  await expect(reticle).toHaveAttribute('data-shots', '0')
  await page.mouse.click(700, 400)
  await expect(reticle).toHaveAttribute('data-shots', '1')
  await page.screenshot({ path: 'test-results/monitor-first-person.png' })
  await page.keyboard.press('KeyC')
  await expect(canvas).toHaveAttribute('data-camera-mode', 'chase')
  await page.keyboard.press('KeyC')
  await expect(canvas).toHaveAttribute('data-camera-mode', 'first-person')
  await page.keyboard.press('Tab')
  await expect(reticle).toBeHidden()
  await page.mouse.click(700, 400)
  await expect(reticle).toHaveAttribute('data-shots', '1')
  await page.keyboard.press('F8')
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(false)
  await expect(reticle).toBeHidden()
  expect(errors).toEqual([])
})
