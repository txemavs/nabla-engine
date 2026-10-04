/** Exercise live display controls and explicit profile reload against the production demo. */
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const url = new URL(process.env.NABLA_GAME_URL ?? 'http://127.0.0.1:5198/?example=flat')
  url.searchParams.set('diagnostics', '1')
  await page.goto(url.href)
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 45000 })
  await page.locator('#display-settings summary').click()
  await page.locator('#display-fps').fill('30')
  await page.locator('#display-fps').press('Tab')
  await page.locator('#display-scale').evaluate((el) => {
    el.value = '50'
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForFunction(() => document.getElementById('game-canvas').width === 640)
  assert.equal(new URL(page.url()).searchParams.get('fps'), '30')
  assert.equal(new URL(page.url()).searchParams.get('scale'), '0.5')
  const frameCount = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const canvas = document.getElementById('game-canvas')
        let count = 0
        const listener = () => count++
        canvas.addEventListener('nabla:frame', listener)
        setTimeout(() => {
          canvas.removeEventListener('nabla:frame', listener)
          resolve(count)
        }, 1200)
      }),
  )
  assert(frameCount > 0 && frameCount <= 39, `Unexpected capped submission count: ${frameCount}`)
  fs.mkdirSync('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/display-settings.png' })
  await page.locator('#display-quality').selectOption('minimal')
  await Promise.all([page.waitForNavigation(), page.locator('#display-apply-quality').click()])
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 45000 })
  await page.waitForFunction(() => document.getElementById('game-canvas').width === 224)
  assert.equal(await page.locator('#display-fps').inputValue(), '30')
  assert.equal(await page.locator('#display-scale').inputValue(), '50')
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      liveScale: true,
      cappedFramesIn1200ms: frameCount,
      reloadPreservesSettings: true,
      errors,
    }),
  )
} finally {
  await browser.close()
}
