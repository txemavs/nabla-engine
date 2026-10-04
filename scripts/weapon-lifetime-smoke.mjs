import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
})
try {
  const page = await browser.newPage()
  await page.route('**/__weapon_lifetime', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<div id="host"></div>' }),
  )
  await page.goto('http://127.0.0.1:5185/__weapon_lifetime')
  const result = await page.evaluate(
    async (root) => {
      const { Sidearm } = await import(root + '/runtime/sidearm.ts')
      const { assets } = await import(root + '/render/entity/assets.ts')
      const pending = []
      assets.instantiate = () => new Promise((resolve) => pending.push(resolve))
      const weapon = new Sidearm(document.querySelector('#host'))
      weapon.visible = true
      const fired = weapon.fire(1000),
        tooSoon = weapon.fire(1001)
      const groups = pending.map(() => new weapon.model.constructor())
      weapon.dispose()
      pending.forEach((resolve, i) => resolve(groups[i]))
      await new Promise((resolve) => setTimeout(resolve, 0))
      const disposed = {
        nodes: document.querySelector('#host').children.length,
        children: weapon.model.children.length,
        fire: weapon.fire(2000),
      }
      const second = new Sidearm(document.querySelector('#host'))
      second.visible = true
      const renderer = {
        autoClear: true,
        clearDepth() {},
        render() {
          throw new Error('render failed')
        },
      }
      try {
        second.render(renderer, 1000, 1, true)
      } catch {}
      const restored = renderer.autoClear
      second.dispose()
      return { fired, tooSoon, disposed, restored }
    },
    '/@fs/' + fileURLToPath(new URL('../src', import.meta.url)).replaceAll('\\', '/'),
  )
  assert.deepEqual(result, {
    fired: true,
    tooSoon: false,
    disposed: { nodes: 0, children: 0, fire: false },
    restored: true,
  })
  console.log('Weapon cadence, late asset completion, disposal and renderer restoration passed')
} finally {
  await browser.close()
}
