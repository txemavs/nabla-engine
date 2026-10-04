import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
})
try {
  const page = await browser.newPage()
  await page.route('**/__monitor_lifetime', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<div id="host"><canvas style="position:absolute;z-index:7;pointer-events:auto"></canvas></div>',
    }),
  )
  await page.goto('http://127.0.0.1:5185/__monitor_lifetime')
  const result = await page.evaluate(
    async (moduleUrl) => {
      const { VehicleMonitors } = await import(moduleUrl)
      const host = document.querySelector('#host'),
        canvas = host.querySelector('canvas')
      const m = new VehicleMonitors(host, () => {}, canvas)
      const scene = { entities: [{ id: 'ship', vehicle: { interior: {} } }] }
      m.rebuild(scene)
      const first = host.querySelectorAll('.helm-console').length
      m.rebuild(scene)
      const second = host.querySelectorAll('.helm-console').length
      m.hide()
      const hidden = [...host.querySelectorAll('.helm-console')].every((e) => e.hidden)
      m.dispose()
      window.dispatchEvent(new Event('blur'))
      document.dispatchEvent(new Event('pointerlockchange'))
      return {
        first,
        second,
        hidden,
        layers: host.querySelectorAll('.portal-tablet-layer').length,
        style: canvas.style.cssText,
        position: host.style.position,
      }
    },
    '/@fs/' +
      fileURLToPath(new URL('../src/runtime/vehicle-monitors.ts', import.meta.url)).replaceAll(
        '\\',
        '/',
      ),
  )
  assert.deepEqual(result, {
    first: 5,
    second: 5,
    hidden: true,
    layers: 0,
    style: 'position: absolute; z-index: 7; pointer-events: auto;',
    position: '',
  })
  console.log('Monitor rebuild, hide, dispose and host style restoration passed')
} finally {
  await browser.close()
}
