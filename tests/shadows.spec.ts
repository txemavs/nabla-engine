import { expect, test } from '@playwright/test'
import { createSampleScene } from '../src/sample.js'

test('shadow coverage follows a scene several kilometres from the origin', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (e) => {
    if (e.type() === 'error' && /shader|THREE/.test(e.text())) errors.push(e.text())
  })
  await page.addInitScript(() => localStorage.setItem('nabla.location.requested', '1'))
  const scene = createSampleScene()
  delete scene.geography
  for (const e of scene.entities) if (!e.parentId) e.transform.position[0] += 2500
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'far-scene.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(scene)),
  })
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#play').click()
  const canvas = page.locator('#viewport > canvas')
  await expect
    .poll(async () => Number((await canvas.getAttribute('data-shadow-center'))?.split(',')[0]))
    .toBeGreaterThan(2400)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(800)
  await page.keyboard.up('KeyW')
  await page.locator('#options-menu-button').click()
  await page.locator('#shadow-distance').evaluate((el: HTMLSelectElement) => {
    el.value = '500'
    el.dispatchEvent(new Event('change'))
  })
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('nabla.performance.v1')!).shadowDistance),
    )
    .toBe(500)
  await page.screenshot({ path: 'test-results/following-shadows.png' })
  expect(errors).toEqual([])
})
