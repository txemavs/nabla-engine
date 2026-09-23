import { test, expect } from '@playwright/test'
import { createCarrier } from '../src/presets.js'
import { createEntity, type Entity } from '../src/scene.js'

test('bounds draw calls for 800 roads and can hide their detail', async ({ page }) => {
  const terrain = {
    ...createEntity('terrain', 'terrain', [0, 0, 0]),
    terrain: { columns: 65, rows: 65, spacing: 20, heights: Array(4225).fill(0) },
  }
  const entities: Entity[] = [
    terrain,
    createCarrier('ship', [0, 1.2, 0]),
    createEntity('spawn', 'spawn', [0, 0.35, -2.85]),
  ]
  for (let i = 0; i < 800; i++)
    entities.push({
      ...createEntity(`r${i}`, 'group', [0, 0, 0]),
      motion: 'none',
      road: {
        terrainId: 'terrain',
        width: 5,
        paths: [
          Array.from(
            { length: 16 },
            (_, j) => [-600 + j * 80, 0, -600 + i * 1.5] as [number, number, number],
          ),
        ],
      },
      source: {
        provider: 'openstreetmap',
        id: `way/${i}`,
        retrievedAt: '2026-09-22',
        tags: { highway: 'residential' },
      },
    })
  await page.addInitScript(() =>
    localStorage.setItem(
      'nabla.performance.v1',
      JSON.stringify({ buildings: 0, distance: 1000, roads: 1000, shadows: 0, resolution: 0.75 }),
    ),
  )
  await page.goto('/?scene=circuit')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-startup', 'ready')
  await page.locator('#file').setInputFiles({
    name: 'perf.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, name: 'Profile', entities })),
  })
  await expect(page.locator('#scene-name')).toHaveText('Profile')
  await page.locator('#play').click()

  const canvas = page.locator('#viewport > canvas')
  await expect(canvas).toHaveAttribute('data-camera-mode', 'first-person')
  // Let two diagnostic intervals pass so measurements belong to this play scene.
  await page.waitForTimeout(1100)
  await expect(canvas).toHaveAttribute('data-draw-calls', /[1-9]/)
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-draw-calls')))
    .toBeLessThan(400)
  const calls = Number(await canvas.getAttribute('data-draw-calls'))
  console.log(`800-road fixture: ${calls} total draw calls, including carrier and terrain`)
  await page.getByRole('button', { name: 'Opciones', exact: true }).click()
  await page.locator('#performance-section > summary').click()
  await page.locator('#road-distance').selectOption('0')
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-draw-calls')))
    .toBeLessThan(calls)
  await page.locator('#road-distance').selectOption('500')
  await expect(page.locator('#road-distance')).toHaveValue('500')
})
