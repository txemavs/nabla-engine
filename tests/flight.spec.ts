import { test, expect } from '@playwright/test'
import { createSampleScene } from '../src/sample.js'

test('flies with a mode 2 gamepad, releases sticks to hover and disconnects safely', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    const pad = {
      connected: true,
      mapping: 'standard',
      index: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0, touched: false })),
    }
    Object.assign(window, { testPad: pad })
    Object.defineProperty(navigator, 'getGamepads', { value: () => (pad.connected ? [pad] : []) })
  })
  const scene = createSampleScene()
  scene.entities.find((e) => e.kind === 'spawn')!.transform.position = [4, 0.1, -15]
  await page.goto('/')
  await page.locator('#file').setInputFiles({
    name: 'flight.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(scene)),
  })
  await expect(page.locator('canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#play').click()
  await page.waitForTimeout(1000)
  const button = async (i: number, down: boolean) =>
    page.evaluate(
      ({ i, down }) => {
        const pad = (window as unknown as { testPad: { buttons: { pressed: boolean }[] } }).testPad
        pad.buttons[i].pressed = down
      },
      { i, down },
    )
  await button(0, true)
  await expect(page.locator('#player-mode')).toHaveText('CONTAINER 5 × 10')
  await button(0, false)
  await button(3, true)
  await expect(page.locator('#player-mode')).toContainText('VUELO')
  await page.waitForTimeout(300)
  await expect(page.locator('#player-mode')).toContainText('VUELO')
  await button(3, false)
  await page.evaluate(() => {
    ;(window as unknown as { testPad: { axes: number[] } }).testPad.axes[1] = -1
  })
  await expect
    .poll(
      async () =>
        Number((await page.locator('#flight-status').textContent())?.match(/Altura ([\d.]+)/)?.[1]),
      { timeout: 15000 },
    )
    .toBeGreaterThan(3)
  await page.evaluate(() => {
    ;(window as unknown as { testPad: { axes: number[] } }).testPad.axes = [0, 0, 0, 0]
  })
  await expect(page.locator('#flight-status')).toContainText('Mando modo 2')
  await page.keyboard.press('KeyV')
  await expect(page.locator('#toast')).toContainText('Desciende')
  await page.screenshot({ path: 'test-results/drone-flight.png' })
  await page.evaluate(() => {
    ;(window as unknown as { testPad: { connected: boolean } }).testPad.connected = false
  })
  await expect(page.locator('#flight-status')).not.toContainText('Mando modo 2')
  await expect(page.locator('#player-mode')).toContainText('VUELO')
  await page.locator('#play').click()
  await expect(page.locator('#mode-label')).toHaveText('Edición')
  expect(errors).toEqual([])
})
