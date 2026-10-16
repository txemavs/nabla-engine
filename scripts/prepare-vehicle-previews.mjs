import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
try {
  await mkdir('assets/library/previews', { recursive: true })
  const origin = process.argv[2] ?? 'https://127.0.0.1:5193'
  const index = await browser.newPage({ ignoreHTTPSErrors: true })
  await index.goto(origin + '/ar.html')
  const kinds = await index.evaluate(async () =>
    (await import('/vehicle-preview.ts')).previewKinds(),
  )
  await index.close()
  for (const kind of kinds) {
    const page = await browser.newPage({
      ignoreHTTPSErrors: true,
      viewport: { width: 800, height: 220 },
    })
    page.on('pageerror', (e) => console.log('ERROR', e.message))
    await page.route('**/__vehicle-preview.html', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
    )
    await page.goto(origin + '/__vehicle-preview.html')
    await page.evaluate(async (kind) => {
      const mod = await import('/vehicle-preview.ts')
      await mod.renderVehiclePreview(kind)
    }, kind)
    await page.locator('canvas').screenshot({ path: `assets/library/previews/${kind}.png` })
    console.log('PREVIEW', kind)
    await page.close()
  }
} finally {
  await browser.close()
}
