import { expect, test } from '@playwright/test'
import { createSampleScene } from '../src/sample.js'
test('changes daylight, freezes time, restores real time and saves the selected clock', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => localStorage.setItem('nabla.location.requested', '1'))
  const doc = createSampleScene()
  doc.geography!.imagery = 'offline'
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'sky.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#options-menu-button').click()
  await page.locator('#sky-section > summary').click()
  await page.locator('#sky-time').fill('2026-09-21T12:00')
  await page.locator('#sky-apply').click()
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-sky-phase', 'day')
  await page.mouse.move(650, 400)
  await page.mouse.wheel(0, 6500)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/horizon-day.png' })
  await page.locator('#sky-time').fill('2026-09-21T00:00')
  await page.locator('#sky-apply').click()
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-sky-phase', 'night')
  await page.screenshot({ path: 'test-results/horizon-night.png' })
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  await page.reload()
  await expect(page.locator('#sky-status')).toContainText('Hora fija')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-sky-phase', 'night')
  await page.locator('#play').click()
  await page.locator('#options-menu-button').click()
  await page.locator('#sky-live').click()
  await expect(page.locator('#sky-status')).toContainText('Tiempo real')
  await expect(page.locator('#mode-label')).toHaveText('Jugando')
  expect(errors).toEqual([])
})
