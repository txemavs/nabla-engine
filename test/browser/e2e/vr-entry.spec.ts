import { test, expect } from '@playwright/test'
test('VR entry appears before the clock only with immersive VR support', async ({ page }) => {
  await page.route('**/vr-entry-check', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<div id="euskadi-clock-group"><span id="clock">12:00</span></div>',
    }),
  )
  await page.goto('/vr-entry-check')
  await page.evaluate(async (root) => {
    const system = new EventTarget() as any
    system.isSessionSupported = async () => true
    Object.defineProperty(navigator, 'xr', { configurable: true, value: system })
    const { mountVREntry } = await import(`/@fs/${root}/game/vr-entry.ts`)
    mountVREntry({
      xr: {
        enter: async () => {
          document.body.dataset.entered = 'true'
        },
      },
    } as any)
  }, process.cwd())
  await expect(page.locator('#euskadi-clock-group > :first-child')).toHaveAttribute(
    'id',
    'euskadi-enter-vr',
  )
  await page.getByRole('button', { name: 'Entrar en realidad virtual' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-entered', 'true')
  await page.evaluate(() => {
    ;(navigator.xr as any).isSessionSupported = async () => false
    navigator.xr!.dispatchEvent(new Event('devicechange'))
  })
  await expect(page.locator('#euskadi-enter-vr')).toHaveCount(0)
})
