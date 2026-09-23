import { expect, test } from '@playwright/test'
test('tile inspector distinguishes loaded geometry from server GLBs and offers downloads and refresh', async ({
  page,
}) => {
  await page.route('**/prepared/**/manifest.json', (r) =>
    r.fulfill({
      json: {
        format: 'nabla-tile-glb-v1',
        key: '1_0',
        groundRevision: 4,
        sizeMetres: 1200,
        groundGridMetres: 0.1,
        hashes: { terrain: 'abc' },
        downloads: { terrain: 'nabla-earth-test-terrain-10cm.glb' },
      },
    }),
  )
  await page.goto('/?scene=circuit')
  await page.evaluate(async () => {
    const module = '/tile-inspector.ts'
    const { tileInspector } = await import(module)
    const host = document.createElement('div')
    host.id = 'test-tile-inspector'
    document.body.append(host)
    host.style.cssText = 'position:fixed;z-index:99999;inset:0;background:#222;color:white'
    tileInspector(
      host,
      { latitude: 43, longitude: -2, altitude: 0 },
      '1_0',
      undefined,
      async (neighbors: boolean) => {
        host.dataset.refreshed = String(neighbors)
      },
      '/prepared',
    )
  })
  const panel = page.locator('#test-tile-inspector')
  await expect(panel).toContainText('Geometría de la escena guardada')
  await expect(panel).toContainText('Servidor: GLB · revisión 4')
  await expect(panel.getByRole('link', { name: 'Descargar terreno GLB' })).toHaveAttribute(
    'download',
    'nabla-earth-test-terrain-10cm.glb',
  )
  await panel.getByRole('button', { name: 'Actualizar las 9 cercanas' }).click()
  await expect(panel).toHaveAttribute('data-refreshed', 'true')
})
