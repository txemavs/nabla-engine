import fs from 'node:fs'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
try {
  fs.mkdirSync('test-results', { recursive: true })
  for (const vehicle of process.env.NABLA_TEST_VEHICLE
    ? [process.env.NABLA_TEST_VEHICLE]
    : ['car', 'white-truck', 'carrier']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const errors = [],
      assets = new Set()
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`)
      if (r.ok()) assets.add(new URL(r.url()).pathname)
    })
    await page.route('**/*', async (route) => {
      if (!['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) {
        errors.push(`External request: ${route.request().url()}`)
        await route.abort()
      } else await route.continue()
    })
    const url = new URL(process.env.NABLA_GAME_URL ?? 'http://127.0.0.1:5188/?example=flat')
    url.searchParams.set('vehicle', vehicle)
    await page.goto(url.href)
    await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 45000 })
    await page.waitForTimeout(2500)
    assert.equal(await page.locator('#vehicle-picker').count(), 0)
    assert.equal(await page.locator('.tile-indicator.loaded').count(), 4)
    assert.ok([...assets].some((a) => a.endsWith('/tractor.body.glb')))
    assert.ok([...assets].some((a) => a.endsWith('/wheel.rear.glb')))
    assert.ok([...assets].some((a) => a.endsWith('/ship.container.5x10.glb')))
    await page.locator('#game-canvas').click()
    if (vehicle === 'car') {
      await page.keyboard.press('KeyH')
      assert.equal(await page.locator('#game-message').textContent(), 'GPS encendido')
      await page.waitForTimeout(1000)
    }
    await page.screenshot({ path: `test-results/fleet-${vehicle}-cockpit.png` })
    await page.keyboard.press('KeyC')
    await page.keyboard.press('KeyC')
    if (vehicle === 'carrier') {
      await page.keyboard.press('KeyV')
      assert.match(await page.locator('#game-message').textContent(), /Modo vuelo/)
    }
    for (let i = 0; i < 30; i++) {
      await page.keyboard.down('KeyW')
      await page.waitForTimeout(100)
    }
    await page.keyboard.up('KeyW')
    const speed = await page.locator('#speed-display').textContent()

    assert.equal(
      await page.locator('#error-message').evaluate((e) => e.classList.contains('visible')),
      false,
      await page.locator('#error-text').textContent(),
    )
    assert.ok(parseInt(speed) > 1, `${vehicle}: ${speed}`)
    await page.screenshot({ path: `test-results/fleet-${vehicle}.png` })
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ vehicle, speed, errors }))
    await page.close()
  }
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5188/?example=flat')
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 45000 })
  await page.waitForTimeout(2000)
  await page.locator('#game-canvas').click()
  await page.keyboard.press('KeyE')
  const walk = async (key, axis, target, sign = 1) => {
    try {
      for (let i = 0; i < 150; i++) {
        const coordinates = (await page.locator('#location-display').textContent())
          .split(',')
          .map(parseFloat)
        if (sign * coordinates[axis] >= sign * target) return
        await page.keyboard.down(key)
        await page.waitForTimeout(100)
      }
      throw new Error(`Walking ${key} did not reach ${target}`)
    } finally {
      await page.keyboard.up(key)
    }
  }
  for (const [longitude, name] of [
    [0.00006, 'Camión blanco'],
    [0.000145, 'Container'],
  ]) {
    await walk('KeyW', 0, 0.00007)
    await walk('KeyD', 1, longitude)
    await walk('KeyS', 0, 0.00003, -1)
    await page.waitForTimeout(300)
    await page.keyboard.press('KeyE')
    assert.match(
      await page.locator('#game-message').textContent(),
      new RegExp(`Conduciendo ${name}`),
    )
    console.log(`Walk and board: ${name}`)
    if (name === 'Camión blanco') {
      await page.waitForTimeout(300)
      await page.keyboard.press('KeyE')
    }
  }
  await page.close()
} finally {
  await browser.close()
}
