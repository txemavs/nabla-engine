import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto(process.env.NABLA_NETWORK_URL ?? 'http://100.100.10.1:5188/?example=flat')
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 45000 })
  await page.locator('#game-canvas').click()
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1000)
  await page.keyboard.up('KeyW')
  assert.equal(await page.locator('.tile-indicator.loaded').count(), 4)
  assert.equal(
    await page.locator('#error-message').evaluate((e) => e.classList.contains('visible')),
    false,
  )
  assert.ok(parseInt(await page.locator('#speed-display').textContent()) > 1)
  assert.deepEqual(errors, [])
  console.log(
    await page.evaluate(() => ({
      secure: isSecureContext,
      subtle: !!globalThis.crypto?.subtle,
      tiles: document.querySelectorAll('.tile-indicator.loaded').length,
      ready: !document.getElementById('game-hud')?.classList.contains('hidden'),
    })),
  )
} finally {
  await browser.close()
}
