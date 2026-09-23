import { test, expect } from './studio-test.js'
import { createPortalPair } from '../src/portal.js'
import { createEntity, rotationDegrees } from '../src/scene.js'
async function openScene(page: import('@playwright/test').Page, z: number) {
  const spawn = createEntity('spawn', 'spawn', [0, 0.35, z])
  spawn.transform.rotation = rotationDegrees(0, 180, 0)
  const doc = {
    version: 1,
    name: 'Rear tablets',
    entities: [
      { ...createEntity('ground', 'box', [0, -0.5, 0]), size: [100, 1, 100] },
      spawn,
      ...createPortalPair('near', 'far', [0, 1.455, 0], [20, 1.455, 0]),
    ],
  }
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'rear.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await page.locator('#play').click()
  await expect(page.locator('#play')).toBeEnabled()
}
test('uses the single rear landscape tablet to close and open a portal', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openScene(page, -0.8)
  const panel = page.locator('.portal-console[data-portal-id="near"]')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Cerrar', exact: true }).click({ timeout: 10000 })
  await expect(panel).toHaveAttribute('data-mode', 'closed')
  await panel.locator('select').selectOption('far')
  await panel.getByRole('button', { name: 'Abrir', exact: true }).click()
  await expect(panel).toHaveAttribute('data-mode', 'open')
  await page.screenshot({ path: 'test-results/rear-tablet.png' })
  expect(errors).toEqual([])
})
test('activates a rear tablet only nearby and disables it on departure', async ({ page }) => {
  await openScene(page, -2)
  const panel = page.locator('.portal-console[data-portal-id="near"]')
  await page.waitForTimeout(1000)
  await expect(panel).toBeHidden()
  for (let i = 0; i < 15 && (await panel.getAttribute('data-active')) !== 'true'; i++) {
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(80)
    await page.keyboard.up('KeyW')
    await page.waitForTimeout(80)
  }
  await expect(panel).toBeVisible()
  await page.keyboard.down('KeyS')
  await expect(panel).toHaveAttribute('data-active', 'false')
  await page.keyboard.up('KeyS')
  await expect(panel).toBeHidden()
  await expect(page.locator('#viewport > canvas')).not.toHaveCSS('pointer-events', 'none')
})
