import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--enable-unsafe-swiftshader'],
})
try {
  for (const quality of ['mobile', 'balanced', 'custom']) {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
      }),
      errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('http://127.0.0.1:5188/?example=flat&quality=' + quality)
    await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 60000 })
    const width = await page.locator('#game-canvas').evaluate((e) => e.width)
    assert.equal(width, 1280 * { mobile: 0.5, balanced: 1.25, custom: 2 }[quality])
    await page.locator('#game-container').click({ position: { x: 640, y: 300 } })
    for (let i = 0; i < 10; i++) {
      await page.keyboard.down('KeyW')
      await page.waitForTimeout(100)
    }
    await page.keyboard.up('KeyW')
    assert.ok(parseInt(await page.locator('#speed-display').textContent()) > 1)
    assert.equal(await page.locator('#error-message.visible').count(), 0)
    assert.deepEqual(errors, [])
    console.log('Packed quality ' + quality + ': width=' + width + ', driving passed')
    await page.close()
  }
} finally {
  await browser.close()
}
