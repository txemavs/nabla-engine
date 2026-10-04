import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const engine = process.argv[2]
if (!engine) throw new Error('Pass the nabla-engine directory')
const require = createRequire(engine + '/package.json')
const { chromium } = require('@playwright/test')
const browser = await chromium.launch({
  headless: true,
  channel: process.platform === 'win32' ? 'msedge' : undefined,
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.goto('http://127.0.0.1:8796')
await page.waitForFunction(() => window.whiteTruckReady === true)
await page.waitForTimeout(1000)
await page.screenshot({ path: fileURLToPath(new URL('../preview-coupled.png', import.meta.url)) })
await page.selectOption('#mode', 'tractor')
await page.waitForFunction(() => window.whiteTruckTelemetry?.vehicles.length === 1)
await page.waitForTimeout(700)
await page.screenshot({ path: fileURLToPath(new URL('../preview-tractor.png', import.meta.url)) })
await page.locator('canvas').click({ position: { x: 1100, y: 500 } })
await page.keyboard.down('KeyW')
await page.waitForTimeout(1800)
await page.keyboard.up('KeyW')
const speed = await page.evaluate(() => window.whiteTruckTelemetry.speedMps)
assert(speed > 0.5)
await page.selectOption('#mode', 'trailer')
await page.waitForTimeout(1000)
await page.screenshot({ path: fileURLToPath(new URL('../preview-trailer.png', import.meta.url)) })
await page.selectOption('#mode', 'separated')
await page.waitForFunction(() => window.whiteTruckMode === 'separated')
assert.equal(await page.evaluate(() => window.whiteTruckTelemetry.coupled), false)
await page.selectOption('#mode', 'coupled')
await page.waitForFunction(() => window.whiteTruckMode === 'coupled')
await page.waitForTimeout(1000)
await page.fill('#cargo', '12000')
await page.click('#apply-cargo')
await page.waitForFunction(() => window.whiteTruckTelemetry.trailerMassKg === 18500)
assert.deepEqual(errors, [])
await writeFile(
  new URL('../browser-results.json', import.meta.url),
  JSON.stringify({ status: 'passed', errors, tractorSpeedAfterInput: speed }, null, 2),
)
await browser.close()
console.log('Browser load, all modes, throttle input, and screenshots passed')
