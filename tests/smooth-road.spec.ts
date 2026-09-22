import { expect, test } from '@playwright/test'
import { createEntity } from '../src/scene.js'

test('selects, saves and renders a smooth road with buildings disabled', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const terrain = createEntity('terrain', 'terrain')
  terrain.terrain = {
    columns: 9,
    rows: 9,
    spacing: 5,
    heights: Array.from(
      { length: 81 },
      (_, i) => (i % 9) * 0.25 + (Math.floor(i / 9) === 4 ? 2 : 0),
    ),
  }
  const road = createEntity('road', 'group')
  road.name = 'Carretera de prueba'
  road.road = {
    terrainId: 'terrain',
    width: 5,
    paths: [
      [
        [0, 0, -18],
        [0, 0, 18],
      ],
    ],
  }
  road.source = {
    provider: 'openstreetmap',
    id: 'way/1',
    retrievedAt: 'test',
    tags: { highway: 'primary' },
  }
  await page.goto('/?scene=circuit')
  await page.locator('#welcome-close').click()
  await page
    .locator('#file')
    .setInputFiles({
      name: 'road.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          name: 'Road test',
          entities: [terrain, road, createEntity('spawn', 'spawn', [2, 3, 12])],
        }),
      ),
    })
  await page.locator('[data-entity-id="road"]').click()
  await expect(page.locator('#road-surface-mode')).toHaveValue('raw')
  await page.locator('#road-surface-mode').selectOption('smooth-float')
  await page.locator('#undo').click()
  await expect(page.locator('#road-surface-mode')).toHaveValue('raw')
  await page.locator('#redo').click()
  await expect(page.locator('#road-surface-mode')).toHaveValue('smooth-float')
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('nabla.scene.v1')!).entities.find(
          (e: { id: string }) => e.id === 'road',
        ).road.mode,
    ),
  ).toBe('smooth-float')
  await page.locator('#options-menu-button').click()
  await page.locator('#performance-section > summary').click()
  await page.locator('#map-buildings').selectOption('0')
  await page.keyboard.press('Escape')
  await page.locator('#play').click()
  await expect(page.locator('#mode-label')).toHaveText('Jugando')
  await page.screenshot({ path: 'test-results/smooth-road.png' })
  await page.locator('#play').click()
  await page.locator('[data-entity-id="road"]').click()
  await expect(page.locator('#road-surface-mode')).toHaveValue('smooth-float')
  expect(errors).toEqual([])
})
