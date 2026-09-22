import { test, expect } from '@playwright/test'
import { createCarrier } from '../src/presets.js'
import { createPortalPair } from '../src/portal.js'
import { createEntity } from '../src/scene.js'
test('uses the central helm screen to animate the garage door and displays telemetry', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const doc = {
    version: 1,
    name: 'Helm',
    entities: [
      { ...createEntity('ground', 'box', [0, -0.5, 0]), size: [100, 1, 100] },
      createEntity('spawn', 'spawn', [0, 0.35, -2.85]),
      createCarrier('ship', [0, 1.2, 0]),
      ...createPortalPair('road-a', 'road-b', [20, 1.455, 0], [35, 1.455, 0]),
    ],
  }
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'helm.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await expect(page.locator('canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#play').click()
  const panel = page.locator('.helm-console')
  await expect(panel).toBeVisible()
  await expect(panel.locator('output')).toContainText('Altitud')
  await expect(page.locator('canvas')).toHaveAttribute('data-nose-camera-frames', /[1-9]/)
  await expect(page.locator('.portal-console.helm-portal')).toHaveCount(2)
  await panel.locator('select').selectOption('300')
  await panel.getByRole('button', { name: 'Cerrar garaje', exact: true }).click({ timeout: 10000 })
  await expect(panel.getByRole('button')).toHaveText('Puerta en movimiento…')
  await expect(panel.getByRole('button')).toHaveText('Abrir garaje', { timeout: 10000 })
  // Turn toward the right-hand portal screen using captured mouse input.
  await page.mouse.click(350, 750)
  await page.waitForFunction(() => !!document.pointerLockElement)
  await page.mouse.move(500, 750, { steps: 10 })
  await page.keyboard.press('KeyG')
  await page.waitForFunction(() => !document.pointerLockElement)
  const stern = page.locator('.portal-console[data-portal-id="carrier-gate-1-stern"]')
  await stern.locator('select').selectOption('road-a')
  const open = stern.getByRole('button', { name: 'Abrir', exact: true })
  await expect
    .poll(() =>
      open.evaluate((button) => {
        const r = button.getBoundingClientRect()
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === button
      }),
    )
    .toBe(true)
  const bounds = (await open.boundingBox())!
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect(stern).toHaveAttribute('data-mode', 'open')
  await page.screenshot({ path: 'test-results/helm-console.png' })
  await page.mouse.click(350, 750)
  await page.waitForFunction(() => !!document.pointerLockElement)
  await page.mouse.move(200, 750, { steps: 10 })
  await page.keyboard.press('KeyG')
  await page.waitForFunction(() => !document.pointerLockElement)
  await panel.getByRole('button', { name: 'Abrir garaje', exact: true }).click()
  await expect(panel.getByRole('button')).toHaveText('Cerrar garaje', { timeout: 10000 })
  await expect(stern).toHaveAttribute('data-mode', 'closed')
  expect(errors).toEqual([])
})
