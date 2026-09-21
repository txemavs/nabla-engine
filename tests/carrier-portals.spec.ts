import { test, expect } from '@playwright/test'
import { createCarrier } from '../src/presets.js'
import { createPortalPair } from '../src/portal.js'
import { createEntity, rotationDegrees } from '../src/scene.js'

test('operates the carrier stern console, changes address and traverses into the chosen world gate', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const spawn = createEntity('spawn', 'spawn', [-1.95, 0.35, 4.1])
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
  await panel.getByRole('button', { name: 'Abrir', exact: true }).click({ timeout: 10000 })
  await expect(panel).toHaveAttribute('data-mode', 'open')
  await page.screenshot({ path: 'test-results/carrier-stargate-open.png' })
  await panel.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(panel).toHaveAttribute('data-mode', 'closed')
  await panel.locator('select').selectOption('road-b')
  await panel.getByRole('button', { name: 'Abrir', exact: true }).click({ timeout: 10000 })
  await expect(panel.locator('small')).toContainText('Stargate · destino')
  await page.keyboard.press('KeyG')
  await page.keyboard.down('KeyW')
  await expect(page.locator('canvas')).toHaveAttribute('data-portal-crossings', /[1-9]/, {
    timeout: 15000,
  })
  await page.keyboard.up('KeyW')
  await expect(page.locator('#toast')).toHaveText('Stargate atravesado')
  await page.screenshot({ path: 'test-results/carrier-stargate-arrival.png' })
  expect(errors).toEqual([])
})

test('keeps tablets off at a distance, activates nearby and disables them on departure', async ({
  page,
}) => {
  const doc = {
    version: 1,
    name: 'Tablet proximity',
    entities: [
      { ...createEntity('ground', 'box', [0, -0.5, 0]), size: [100, 1, 100] },
      createEntity('spawn', 'spawn', [2.05, 0.35, 2]),
      ...createPortalPair('near', 'far', [0, 1.455, 0], [20, 1.455, 0]),
    ],
  }
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'tablets.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await page.locator('#play').click()
  const panel = page.locator('.portal-console[data-portal-id="near"]')
  await page.waitForTimeout(1000)
  await expect(panel).toBeHidden()
  await expect(panel).toHaveAttribute('data-active', 'false')
  // Approach in short steps so a polling interval cannot carry us through the open gate.
  for (let i = 0; i < 15 && (await panel.getAttribute('data-active')) !== 'true'; i++) {
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(80)
    await page.keyboard.up('KeyW')
    await page.waitForTimeout(80)
  }
  await expect(panel).toHaveAttribute('data-active', 'true')
  await expect(panel).toBeVisible()
  await page.keyboard.down('KeyS')
  await expect(panel).toHaveAttribute('data-active', 'false')
  await page.keyboard.up('KeyS')
  await expect(panel).toBeHidden()
  await expect(page.locator('canvas')).not.toHaveCSS('pointer-events', 'none')
})
