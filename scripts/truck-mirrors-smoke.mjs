/** Check cockpit mirror captures and save both driver views for visual inspection. */
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
  await page.goto(
    (process.env.NABLA_GAME_URL ?? 'http://127.0.0.1:5198/') + '?example=flat&vehicle=white-truck',
  )
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 60000 })
  await page.waitForTimeout(2000)
  await page.locator('#game-canvas').click({ position: { x: 640, y: 400 } })
  fs.mkdirSync('test-results', { recursive: true })
  await page.waitForFunction(
    () => document.querySelector('#game-canvas').dataset.mirrorActive === 'true',
  )
  await page.mouse.down()
  await page.mouse.move(460, 400)
  await page.mouse.up()
  await page.waitForTimeout(700)
  await page.waitForFunction(
    () => Number(document.querySelector('#game-canvas').dataset.mirrorFrames) > 0,
  )
  await page.screenshot({ path: 'test-results/truck-mirror-left.png' })
  await page.mouse.down()
  await page.mouse.move(1140, 400)
  await page.mouse.up()
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'test-results/truck-mirror-right.png' })
  const frames = await page.locator('#game-canvas').getAttribute('data-mirror-frames')
  await page.keyboard.press('KeyC')
  await page.waitForFunction(
    () => document.querySelector('#game-canvas').dataset.mirrorActive === 'false',
  )
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ frames, errors }))
} finally {
  await browser.close()
}
