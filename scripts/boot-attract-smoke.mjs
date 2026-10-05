/** Attract boot, host splash skin, probe and auto resolution against the production demo. */
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
  // A host page sets window.NABLA_BOOT before main.ts; emulate it with an init script.
  await page.addInitScript(() => {
    window.NABLA_BOOT = {
      attract: true,
      probeMs: 1500,
      splash: {
        title: 'EUSKADI ONLINE',
        messages: ['Mundua kargatzen…', 'Lurraldea prestatzen…'],
        themeCss: '#loading-screen { --splash-accent: #00a650; }',
      },
    }
  })
  const url = new URL(process.env.NABLA_GAME_URL ?? 'http://127.0.0.1:5198/?example=flat')
  await page.goto(url.href)
  await page.waitForFunction(
    () => document.getElementById('game-canvas')?.dataset.bootMode === 'attract',
    null,
    { timeout: 20000 },
  )
  const splash = await page.evaluate(() => ({
    title: document.getElementById('loading-title')?.textContent,
    layout: document.getElementById('loading-screen')?.dataset.splashLayout,
    theme: !!document.querySelector('style[data-nabla-splash-theme]'),
    mode: document.getElementById('game-canvas')?.dataset.resolutionScaleMode,
  }))
  assert.equal(splash.title, 'EUSKADI ONLINE')
  assert.equal(splash.layout, 'corner')
  assert.equal(splash.theme, true)
  assert.equal(splash.mode, 'auto')
  fs.mkdirSync('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/boot-attract.png' })
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 60000 })
  const after = await page.evaluate(() => {
    const data = document.getElementById('game-canvas').dataset
    return {
      boot: data.bootMode,
      tier: data.probeTier,
      scale: Number(data.resolutionScale),
      mode: data.resolutionScaleMode,
    }
  })
  assert.equal(after.boot, 'play')
  assert(after.tier, 'probe tier recorded')
  assert(after.scale >= 0.5 && after.scale <= 1, `auto scale in range: ${after.scale}`)
  assert.equal(after.mode, 'auto')
  await page.screenshot({ path: 'test-results/boot-play.png' })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ splash, after, errors }))
} finally {
  await browser.close()
}
