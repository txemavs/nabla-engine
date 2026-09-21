import { test, expect } from '@playwright/test'
import { createCarrier } from '../src/presets.js'
import { createPortalPair } from '../src/portal.js'
import { createEntity, rotationDegrees } from '../src/scene.js'

test('operates the carrier stern console, changes address and traverses into the chosen world gate', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const spawn = createEntity('spawn', 'spawn', [0, 0.35, 1.5])
  spawn.transform.rotation = rotationDegrees(0, 180, 0)
  const doc = {
    version: 1,
    name: 'Carrier portals',
    entities: [
      { ...createEntity('ground', 'box', [0, -0.5, 0]), size: [100, 1, 100] },
      spawn,
      createCarrier('ship', [0, 1.2, 0]),
      ...createPortalPair('road-a', 'road-b', [20, 1.455, 0], [35, 1.455, 0]),
    ],
  }
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'carrier.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await expect(page.locator('canvas')).toHaveAttribute('data-assets', 'loaded', { timeout: 20000 })
  await page.locator('#play').click()
  const panel = page.locator('.portal-console[data-portal-id="carrier-gate-1-stern"]')
  await expect(panel).toBeVisible({ timeout: 15000 })
  await expect(panel).toHaveAttribute('data-mode', 'closed')
  await panel.locator('select').selectOption('road-a')
  await panel.getByRole('button', { name: 'Abrir', exact: true }).click()
  await expect(panel).toHaveAttribute('data-mode', 'open')
  await page.screenshot({ path: 'test-results/carrier-stargate-open.png' })
  await panel.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(panel).toHaveAttribute('data-mode', 'closed')
  await panel.locator('select').selectOption('road-b')
  await panel.getByRole('button', { name: 'Abrir', exact: true }).click()
  await expect(panel.locator('small')).toContainText('Stargate · destino')
  await page.locator('canvas').click({ position: { x: 100, y: 100 } })
  await page.keyboard.down('KeyW')
  await expect(page.locator('canvas')).toHaveAttribute('data-portal-crossings', /[1-9]/, {
    timeout: 15000,
  })
  await page.keyboard.up('KeyW')
  await expect(page.locator('#toast')).toHaveText('Stargate atravesado')
  await page.screenshot({ path: 'test-results/carrier-stargate-arrival.png' })
  expect(errors).toEqual([])
})
