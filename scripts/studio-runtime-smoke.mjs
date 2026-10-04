import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() =>
    localStorage.setItem(
      'nabla.performance.v1',
      JSON.stringify({ resolution: 0.35, shadows: 0, mirrors: 0, dof: 0 }),
    ),
  )
  await page.goto(process.env.NABLA_STUDIO_URL ?? 'http://127.0.0.1:5185/?scene=circuit')
  await page.waitForFunction(
    () => document.querySelector('#viewport > canvas')?.dataset.startup === 'ready',
  )
  const canvas = page.locator('#viewport > canvas')
  await canvas.click()
  await page.keyboard.press('F8')
  await page.waitForFunction(() => document.body.classList.contains('playing'))
  await page.keyboard.press('KeyE')
  await page.waitForFunction(
    () => document.querySelector('#viewport > canvas')?.dataset.cameraMode === 'cockpit',
  )
  await page.keyboard.press('KeyC')
  await page.waitForFunction(
    () => document.querySelector('#viewport > canvas')?.dataset.cameraMode === 'map',
  )
  await page.keyboard.press('KeyC')
  await page.waitForFunction(
    () => document.querySelector('#viewport > canvas')?.dataset.cameraMode === 'chase',
  )
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1200)
  await page.keyboard.up('KeyW')
  await page.keyboard.press('F8')
  await page.waitForFunction(() => !document.body.classList.contains('playing'))
  await page.waitForFunction(() => !document.getElementById('play').disabled)
  await page.keyboard.press('F8')
  await page.waitForFunction(() => document.body.classList.contains('playing'))
  await page.waitForFunction(() => !document.getElementById('play').disabled)
  await page.keyboard.press('F8')
  await page.waitForFunction(() => !document.body.classList.contains('playing'))
  assert.deepEqual(errors, [])
  console.log('Studio: play, board, three cameras, drive, stop and restart passed')
} catch (error) {
  console.error(errors)
  throw error
} finally {
  await browser.close()
}
