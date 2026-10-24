import { test, expect } from '@playwright/test'
import { offlinePageHtml } from '../../../src/pwa/index.js'

test('offline shell stays readable in English and Retry leaves the direct offline page', async ({
  page,
}) => {
  const html = offlinePageHtml({
    appName: 'Euskadi Online',
    texts: {
      en: {
        title: 'Connection lost',
        message: 'Check your connection, then try again.',
        retry: 'Retry',
      },
    },
  })
  await page.route('**/offline.html*', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await page.route('**/restored', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Connected</h1>' }),
  )
  await page.goto('/offline.html?locale=es')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.getByRole('heading', { name: 'Connection lost' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `tmp/offline-${width}.png` })
  }
  await page.route('http://127.0.0.1:5191/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Connected</h1>' }),
  )
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('heading', { name: 'Connected' })).toBeVisible()
  // The service worker fallback keeps the original navigation URL; retry must preserve it.
  let requests = 0
  await page.route('**/session?vehicle=car', (route) => {
    requests++
    return route.fulfill({
      contentType: 'text/html',
      body: requests === 1 ? html : '<h1>Reconnected</h1>',
    })
  })
  await page.goto('/session?vehicle=car')
  await page.evaluate(() => dispatchEvent(new Event('online')))
  await expect(page.getByRole('heading', { name: 'Reconnected' })).toBeVisible()
  await expect(page).toHaveURL(/session\?vehicle=car$/)
})
