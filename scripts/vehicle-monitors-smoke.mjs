import fs from 'node:fs'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--enable-unsafe-swiftshader'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const base = process.env.NABLA_GAME_URL ?? 'http://127.0.0.1:5188/'
  await page.goto(base + '?example=flat&vehicle=carrier')
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 60000 })
  const systems = page.locator('.systems-console')
  await systems.waitFor()
  await systems.locator('[data-helm="drone"]').first().click()
  await page.waitForFunction(() =>
    document.querySelector('.telemetry-console small')?.textContent.includes('VUELO'),
  )
  assert.equal(
    await page.locator('#game-canvas').evaluate((e) => e === document.activeElement),
    true,
  )
  await systems.locator('[data-ship="nav"]').click()
  assert.equal(
    await systems.locator('[data-ship="nav"]').evaluate((e) => e.classList.contains('is-on')),
    true,
  )
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(700)
  await page.keyboard.up('KeyW')
  assert.ok(parseInt(await page.locator('#speed-display').textContent()) > 0)
  fs.mkdirSync('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/vehicle-monitors.png' })
  await page.keyboard.press('KeyC')
  await page.keyboard.press('KeyC')
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.helm-console')].every((e) => e.hidden),
  )
  assert.equal(await page.locator('#game-canvas').evaluate((e) => e.style.pointerEvents), '')
  await page.goto(base + '?example=flat')
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 60000 })
  await page.locator('#game-container').click({ position: { x: 640, y: 300 } })
  await page.keyboard.press('KeyJ')
  assert.match(await page.locator('#game-message').textContent(), /Menú del coche/)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('KeyJ')
  assert.equal(await page.locator('#game-message').textContent(), 'Menú cerrado')
  assert.deepEqual(errors, [])
  console.log('Native monitor buttons, flight, focus, camera visibility and car menu passed')
} finally {
  await browser.close()
}
