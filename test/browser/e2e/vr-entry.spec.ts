import { test, expect, type Page } from '@playwright/test'

async function mount(page: Page, supported: boolean) {
  await page.route('**/vr-entry-check', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<canvas id="game-canvas"></canvas>' }),
  )
  await page.goto('/vr-entry-check')
  return page.evaluate(
    async ({ root, supported }) => {
      let probes = 0
      const system = new EventTarget() as any
      system.isSessionSupported = async () => {
        probes++
        return supported
      }
      Object.defineProperty(navigator, 'xr', { configurable: true, value: system })
      const { mountVREntry } = await import(`/@fs/${root}/game/vr-entry.ts`)
      const xr = {
        enter: async () => {
          document.body.dataset.entered = 'true'
        },
      }
      mountVREntry({ loadXR: async () => xr } as any)
      // The probe waits for the loaded, idle page: nothing touches navigator.xr during boot.
      return probes
    },
    { root: process.cwd(), supported },
  )
}

test('one casco button left of the clock when a headset is there; it enters PC VR', async ({
  page,
}) => {
  expect(await mount(page, true)).toBe(0)
  const button = page.locator('#nabla-corner-tr > .nabla-btn--icon[aria-label*="casco"]')
  await expect(button).toBeVisible()
  await expect(button).toHaveAttribute('data-order', '50')
  await expect(page.locator('.nabla-btn[aria-label*="casco"]')).toHaveCount(1)
  await button.click()
  await expect(page.locator('body')).toHaveAttribute('data-entered', 'true')
  expect(new URL(page.url()).searchParams.get('vr')).toBe('pc')
  const mode = await page.evaluate(
    async (root) => (await import(`/@fs/${root}/src/runtime/settings-scope.ts`)).activePlayMode(),
    process.cwd(),
  )
  expect(mode).toBe('headset-pc')
})

test('no casco button without immersive VR support', async ({ page }) => {
  await mount(page, false)
  await page.waitForTimeout(2500)
  await expect(page.locator('.nabla-btn[aria-label*="casco"]')).toHaveCount(0)
})
