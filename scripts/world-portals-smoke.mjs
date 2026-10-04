import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--enable-unsafe-swiftshader'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/*', (r) => {
    if (new URL(r.request().url()).hostname !== '127.0.0.1') {
      errors.push('External request: ' + r.request().url())
      return r.abort()
    }
    return r.continue()
  })
  await page.goto('http://127.0.0.1:5188/?example=flat&remote=1')
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 60000 })
  await page.waitForFunction(
    () => Number(document.querySelector('#game-canvas').dataset.portalViews) > 0,
  )
  await page.waitForTimeout(2000)
  fs.mkdirSync('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/world-portal.png' })
  assert.equal(await page.locator('#error-message.visible').count(), 0)
  assert.deepEqual(errors, [])
  console.log('Packed cross-location window rendered without external requests')
} finally {
  await browser.close()
}
