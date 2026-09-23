import { createSampleScene } from '../src/sample.js'
import type { Page } from '@playwright/test'
import { test as base, expect } from '@playwright/test'
/** HTML can arrive before Vite has attached import/play handlers. Wait for Studio's
 * public readiness signal, not a delay, before tests interact with the app. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    page.goto = async (url, options) => {
      const response = await goto(url, options)
      if (['/', '/index.html'].includes(new URL(page.url()).pathname))
        await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-startup', 'ready', {
          timeout: 30000,
        })
      return response
    }
    await use(page)
  },
})
export { expect }

/** Coordinate editing tests exercise a local simulation, not geographic anchors. */
export async function localCircuit(page: Page) {
  const scene = createSampleScene()
  delete scene.geography
  await page.addInitScript((value) => {
    if (!localStorage.getItem('nabla.scene.v1')) localStorage.setItem('nabla.scene.v1', value)
  }, JSON.stringify(scene))
}
