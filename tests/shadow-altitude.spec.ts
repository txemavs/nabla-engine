import { test, expect } from '@playwright/test'
import { createA3 } from '../src/presets.js'
import { createEntity } from '../src/scene.js'

test('changing to elevated coordinates does not disable vehicle shadows', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?scene=circuit')
  for (const elevation of [0, 650, 1800]) {
    await page.locator('#file').setInputFiles({
      name: 'elevated-road.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          name: 'Elevated road',
          geography: { latitude: 41.5, longitude: -5.75, altitude: 0, imagery: 'offline' },
          sky: { mode: 'fixed', at: '2026-09-22T12:00:00Z' },
          entities: [
            { ...createEntity('ground', 'box', [0, elevation - 0.5, 0]), size: [100, 1, 100] },
            createEntity('spawn', 'spawn', [-2, elevation + 0.35, 0]),
            createA3('car', [0, elevation + 0.62, 0]),
          ],
        }),
      ),
    })
    await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
    await page.locator('[data-entity-id="car"]').click()
    await page.locator('#focus').click()
    await expect(page.locator('#viewport > canvas')).toHaveAttribute(
      'data-geo-level',
      elevation > 250 ? 'map' : 'local',
    )
    for (const [quality, cascades] of [
      ['512', '1'],
      ['1024', '2'],
      ['2048', '3'],
      ['0', '0'],
    ]) {
      await page.locator('#shadow-quality').evaluate((element, value) => {
        const select = element as HTMLSelectElement
        select.value = value
        select.dispatchEvent(new Event('change'))
      }, quality)
      await expect(page.locator('#viewport > canvas')).toHaveAttribute(
        'data-shadow-cascades',
        cascades,
      )
    }
  }
  expect(errors).toEqual([])
})
