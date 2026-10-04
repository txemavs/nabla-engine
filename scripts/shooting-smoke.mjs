import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--enable-unsafe-swiftshader'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(r.status() + ' ' + r.url())
  })
  await page.goto(process.env.NABLA_GAME_URL ?? 'http://127.0.0.1:5188/?example=flat')
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 60000 })
  await page.locator('#game-container').click({ position: { x: 640, y: 300 } })
  await page.keyboard.press('KeyE')
  await page.keyboard.press('Tab')
  const reticle = page.locator('[aria-label="Punto de mira"]')
  await reticle.waitFor()
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Punto de mira"]')?.dataset.weapon === 'loaded',
  )
  await page.keyboard.press('KeyC')
  await page.locator('#game-canvas').click({ position: { x: 640, y: 300 } })
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Punto de mira"]')?.dataset.shots === '1',
  )
  await page.keyboard.press('Tab')
  await reticle.waitFor({ state: 'hidden' })
  await page.locator('#game-canvas').click({ position: { x: 640, y: 300 } })
  assert.equal(await reticle.getAttribute('data-shots'), '1')
  await page.keyboard.press('Tab')
  await page.keyboard.press('KeyE')
  await reticle.waitFor({ state: 'hidden' })
  assert.deepEqual(errors, [])
  console.log(
    'Packed game: weapon asset, drawing, firing, holstering and boarding suppression passed',
  )
} finally {
  await browser.close()
}
