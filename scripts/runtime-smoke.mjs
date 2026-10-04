import fs from 'node:fs'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
const errors = [],
  external = [],
  responses = []
let page
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) responses.push([response.status(), response.url()])
  })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      external.push(url.href)
      await route.abort()
    } else await route.continue()
  })
  await page.goto(process.env.NABLA_GAME_URL ?? 'http://localhost:5184/?example=flat')
  await page.waitForFunction(
    () =>
      !document.getElementById('game-hud').classList.contains('hidden') ||
      document.getElementById('error-message').classList.contains('visible'),
    null,
    { timeout: 45000 },
  )
  assert.equal(
    await page.locator('#error-message').evaluate((el) => el.classList.contains('visible')),
    false,
    await page.locator('#error-text').textContent(),
  )
  assert.equal(await page.locator('.tile-indicator.loaded').count(), 4)
  await page.locator('#game-canvas').click()
  await page.keyboard.press('KeyC')
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(3500)
  await page.keyboard.up('KeyW')
  const speed = await page.locator('#speed-display').textContent()
  assert.ok(parseInt(speed) > 1, `Expected driving speed, got ${speed}`)
  const location = await page.locator('#location-display').textContent()
  assert.ok(!location.includes('NaN'))
  await page.keyboard.press('KeyC')
  fs.mkdirSync('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/runtime-flat-z15.png' })
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  assert.deepEqual(responses, [])
  console.log(JSON.stringify({ speed, location, tiles: 4, errors, external, responses }))
} catch (error) {
  console.error(JSON.stringify({ errors, external, responses }))
  if (page) console.error(await page.locator('body').innerText())
  throw error
} finally {
  await browser.close()
}
