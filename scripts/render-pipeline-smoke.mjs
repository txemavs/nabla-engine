import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--enable-unsafe-swiftshader'],
})
try {
  for (const dof of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
      errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('http://127.0.0.1:5188/?example=flat&gallery=1' + (dof ? '&dof=1' : ''))
    await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 60000 })
    await page.waitForFunction(
      () => Number(document.querySelector('#game-canvas').dataset.portalViews) > 0,
    )
    await page.waitForTimeout(1500)
    fs.mkdirSync('test-results', { recursive: true })
    await page.screenshot({
      path: 'test-results/portal-pipeline-' + (dof ? 'dof' : 'plain') + '.png',
    })
    assert.equal(await page.locator('#error-message.visible').count(), 0)
    assert.deepEqual(errors, [])
    console.log('Packed portal view rendered, depth of field = ' + dof)
    await page.close()
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto('http://127.0.0.1:5188/?example=flat&vehicle=carrier&dof=1')
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 60000 })
  await page.locator('.systems-console [data-helm="drone"]').first().click()
  await page.waitForFunction(() =>
    document.querySelector('.telemetry-console small')?.textContent.includes('VUELO'),
  )
  await page.screenshot({ path: 'test-results/portal-pipeline-monitors-dof.png' })
  assert.equal(await page.locator('#error-message.visible').count(), 0)
  console.log('Native cockpit monitors work with depth of field')
} finally {
  await browser.close()
}
