import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
})
try {
  const page = await browser.newPage({ hasTouch: true, viewport: { width: 900, height: 700 } })
  await page.route('**/__touch_test', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<div id="host" style="position:relative;width:900px;height:700px"></div>',
    }),
  )
  await page.goto('http://127.0.0.1:5185/__touch_test')
  await page.evaluate(
    async (url) => {
      const { TouchDriving } = await import(url)
      window.touch = new TouchDriving(
        document.querySelector('#host'),
        { interact: () => {}, camera: () => {} },
        'always',
      )
      window.touch.setActive(true)
    },
    '/@fs/' +
      fileURLToPath(new URL('../src/runtime/touch-driving.ts', import.meta.url)).replaceAll(
        '\\',
        '/',
      ),
  )
  const cdp = await page.context().newCDPSession(page)
  const center = async (action) => {
    const b = await page.locator(`[data-drive="${action}"]`).boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const forward = { ...(await center('forward')), id: 1 },
    right = { ...(await center('right')), id: 2 }
  const input = () => page.evaluate(() => window.touch.input())
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [forward, right] })
  assert.deepEqual(await input(), { forward: 1, right: 1, brake: false })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [right] })
  assert.deepEqual(await input(), { forward: 1, right: 0, brake: false })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  assert.deepEqual(await input(), { forward: 0, right: 0, brake: false })
  for (const release of ['blur', 'disable']) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [forward] })
    assert.equal((await input()).forward, 1)
    await page.evaluate(
      (release) =>
        release === 'blur'
          ? window.dispatchEvent(new Event('blur'))
          : window.touch.setActive(false),
      release,
    )
    assert.deepEqual(await input(), { forward: 0, right: 0, brake: false })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await page.evaluate(() => window.touch.dispose())
  assert.equal(await page.locator('.touch-driving').count(), 0)
  console.log(
    'Touch: simultaneous steering/pedal, independent release, cancellation, blur, disable and disposal passed',
  )

  await page.goto(process.env.NABLA_GAME_URL ?? 'http://127.0.0.1:5188/?example=flat')
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 60000 })
  await page.locator('[data-drive="forward"]:enabled').waitFor()
  const pedal = { ...(await center('forward')), id: 3 }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pedal] })
  await page.waitForTimeout(1400)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  const speed = parseInt(await page.locator('#speed-display').textContent())
  assert.ok(speed > 1, 'Touch accelerator moves the car')
  const brake = { ...(await center('brake')), id: 4 }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [brake] })
  await page.waitForTimeout(1500)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  assert.ok(
    parseInt(await page.locator('#speed-display').textContent()) < speed,
    'Touch brake reduces speed',
  )
  await page.locator('[data-drive="camera"]').tap()
  assert.equal(
    await page.locator('#game-canvas').evaluate((e) => e === document.activeElement),
    true,
  )
  assert.equal(await page.locator('#error-message.visible').count(), 0)
  console.log('Packed game: coarse-pointer controls, acceleration, braking and camera focus passed')
} finally {
  await browser.close()
}
