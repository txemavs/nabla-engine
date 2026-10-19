import { test, expect } from '@playwright/test'
test('PC VR entry appears before the clock only with ?vr=pc and immersive VR support', async ({
  page,
}) => {
  await page.route('**/vr-entry-check?vr=pc', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<div id="euskadi-clock-group"><span id="clock">12:00</span></div>',
    }),
  )
  await page.goto('/vr-entry-check?vr=pc')
  await page.evaluate(async (root) => {
    const system = new EventTarget() as any
    system.isSessionSupported = async () => true
    Object.defineProperty(navigator, 'xr', { configurable: true, value: system })
    const { mountVREntry } = await import(`/@fs/${root}/game/vr-entry.ts`)
    // XR code loads on demand: the runtime hands the XR system out through loadXR().
    const xr = {
      enter: async () => {
        document.body.dataset.entered = 'true'
      },
    }
    mountVREntry({ loadXR: async () => xr } as any)
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

test('the normal game never touches navigator.xr', async ({ page }) => {
  await page.route('**/vr-entry-check', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<div id="euskadi-clock-group"><span id="clock">12:00</span></div>',
    }),
  )
  await page.goto('/vr-entry-check')
  const touched = await page.evaluate(async (root) => {
    let reads = 0
    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      get() {
        reads++
        return undefined
      },
    })
    const { mountVREntry } = await import(`/@fs/${root}/game/vr-entry.ts`)
    mountVREntry(
      new Proxy(
        {},
        {
          get() {
            throw new Error('touched the runtime')
          },
        },
      ) as any,
    )
    await new Promise((resolve) => setTimeout(resolve, 200))
    return reads
  }, process.cwd())
  expect(touched).toBe(0)
  await expect(page.locator('#euskadi-enter-vr')).toHaveCount(0)
})
