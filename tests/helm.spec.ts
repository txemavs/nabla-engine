import { test, expect } from '@playwright/test'
import { createCarrier } from '../src/presets.js'
import { createPortalPair } from '../src/portal.js'
import { createEntity } from '../src/scene.js'
test('uses the horizontal desk to animate the garage door and displays telemetry', async ({
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
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#play').click()
  const panel = page.locator('.touch-console')
  await page.mouse.click(350, 300)
  await page.waitForFunction(() => !!document.pointerLockElement)
  await page.keyboard.press('KeyE')
  await page.keyboard.press('KeyC')
  await page.mouse.move(350, 700, { steps: 10 })
  await page.keyboard.press('KeyG')
  await expect(panel).toBeVisible()
  await expect(page.locator('.telemetry-console output')).toContainText('Altitud')
  await expect(page.locator('#viewport > canvas')).not.toHaveAttribute('data-nose-camera-frames')
  await expect(page.locator('.touch-console')).toHaveCount(1)
  await expect(page.locator('.telemetry-console')).toHaveCount(1)
  await expect(page.locator('.map-console canvas')).toBeVisible()
  await expect(panel.locator('.dpad')).toHaveCount(2)
  await expect(page.locator('.portal-console.helm-portal')).toHaveCount(1)
  await panel.locator('select').selectOption('300')
  await panel.getByRole('button', { name: 'Cerrar garaje', exact: true }).click({ timeout: 10000 })
  await expect(panel.locator('[data-door]')).toHaveText('Puerta en movimiento…')
  await expect(panel.locator('[data-door]')).toHaveText('Abrir garaje', { timeout: 10000 })
  // Turn toward the right-hand portal screen using captured mouse input.
  await page.mouse.click(350, 300)
  await page.waitForFunction(() => !!document.pointerLockElement)
  await page.mouse.move(650, 200, { steps: 10 })
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
  await page.mouse.click(350, 300)
  await page.waitForFunction(() => !!document.pointerLockElement)
  await page.mouse.move(50, 400, { steps: 10 })
  await page.keyboard.press('KeyG')
  await page.waitForFunction(() => !document.pointerLockElement)
  await panel.getByRole('button', { name: 'Abrir garaje', exact: true }).click()
  await expect(panel.locator('[data-door]')).toHaveText('Cerrar garaje', { timeout: 10000 })
  await expect(stern).toHaveAttribute('data-mode', 'closed')
  expect(errors).toEqual([])
})

test('flies using the horizontal CSS desk and releases held input', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'touch.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: 'Touch helm',
        entities: [
          { ...createEntity('ground', 'box', [0, -0.5, 0]), size: [1000, 1, 1000] },
          createEntity('spawn', 'spawn', [0, 0.35, -2.85]),
          createCarrier('ship', [0, 1.2, 0]),
        ],
      }),
    ),
  })
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#play').click()
  await page.mouse.click(350, 300)
  await page.waitForFunction(() => !!document.pointerLockElement)
  await page.keyboard.press('KeyE')
  await page.keyboard.press('KeyC')
  await page.keyboard.press('KeyV')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-camera-mode', 'cockpit')
  await page.mouse.move(350, 700, { steps: 10 })
  await page.keyboard.press('KeyG')
  const touch = page.locator('.touch-console')
  await expect(touch).toBeVisible()
  const advance = touch.getByRole('button', { name: 'Avanzar', exact: true })
  await expect(advance).toBeEnabled()
  await expect
    .poll(() =>
      advance.evaluate((button) => {
        const r = button.getBoundingClientRect()
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === button
      }),
    )
    .toBe(true)
  const r = (await advance.boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.down()
  const telemetry = page.locator('.telemetry-console output')
  await expect(telemetry).not.toHaveText(/^0 km\/h/)
  await page.mouse.up()
  await expect(telemetry).toHaveText(/^0 km\/h/, { timeout: 15000 })
  await page.screenshot({ path: 'test-results/touch-helm.png' })
  expect(errors).toEqual([])
})

test('keeps CSS screens active and clickable from the rear of the occupied interior', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'interior-screens.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: 'Interior screens',
        entities: [
          { ...createEntity('ground', 'box', [0, -0.5, 0]), size: [100, 1, 100] },
          createEntity('spawn', 'spawn', [0, 1, 2]),
          createCarrier('ship', [0, 1.2, 0]),
        ],
      }),
    ),
  })
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#play').click()
  await expect(page.locator('#player-mode')).toContainText('INTERIOR DE LA NAVE')
  await expect(page.locator('.telemetry-console')).toHaveAttribute('data-active', 'true')
  await expect(page.locator('.touch-console')).toHaveAttribute('data-active', 'true')
  const open = page.locator('.helm-portal').getByRole('button', { name: 'Abrir', exact: true })
  await page.waitForTimeout(700)
  await open.click({ timeout: 10000 })
  await expect(page.locator('#toast')).toContainText('Elige un destino primero')
})
