import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--enable-unsafe-swiftshader'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
    errors = [],
    external = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/*', (r) => {
    if (new URL(r.request().url()).hostname !== '127.0.0.1') {
      external.push(r.request().url())
      return r.abort()
    }
    return r.continue()
  })
  await page.goto('http://127.0.0.1:5188/?example=flat&lights=1')
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 60000 })
  await page.waitForTimeout(2000)
  fs.mkdirSync('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/field-lights-night.png' })
  await page.locator('#game-container').click({ position: { x: 640, y: 300 } })
  for (let i = 0; i < 15; i++) {
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(100)
  }
  await page.keyboard.up('KeyW')
  assert.ok(parseInt(await page.locator('#speed-display').textContent()) > 1)
  assert.equal(await page.locator('#error-message.visible').count(), 0)
  assert.deepEqual(external, [])
  assert.deepEqual(errors, [])
  console.log('Packed night scene: bundled light source, driving and zero external requests passed')
} finally {
  await browser.close()
}
