import { expect, test } from '@playwright/test'
test('main quality menu saves native XR scale, effects and road profile with development folded', async ({
  page,
}) => {
  await page.goto('/xr.html?example=flat&solo=1&vehicle=car&quality=minimal&diagnostics=1')
  await expect(page.locator('#loading-screen')).toHaveClass(/hidden/, { timeout: 60000 })
  await expect(page.locator('#xr-main-menu')).toBeVisible()
  await expect(page.locator('#xr-calibration')).not.toBeVisible()
  await page.getByRole('button', { name: 'Aumentar Escala de resolución VR', exact: true }).click()
  await expect(page.locator('#xr-quality-1')).toHaveText('85%')
  await page.getByRole('button', { name: 'Aumentar Efectos: humo y chispas', exact: true }).click()
  expect(await page.evaluate(() => (window as any).nablaRuntime.smokeEnabled)).toBe(false)
  const menu = await page.evaluate(() => {
    const r = (window as any).nablaRuntime
    r.xr.calibrationScreen.hide()
    r.xr.toggleMenu()
    const opened = r.xr.calibrationScreen.isOpen && !r.xr.calibrationScreen.development
    r.xr.toggleMenu()
    return {
      opened,
      closed: !r.xr.calibrationScreen.isOpen,
      rows: r.xr.calibrationScreen.qualityMenu.rows(),
    }
  })
  expect(menu.opened && menu.closed).toBe(true)
  expect(menu.rows[1].value).toBe('85%')
  await page.getByRole('button', { name: 'Perfil Carretera', exact: true }).click()
  await expect(page.locator('#xr-quality-1')).toHaveText('100%')
  await page.getByRole('button', { name: 'Aplicar calidad y reiniciar', exact: true }).click()
  await page.waitForURL(/quality=road/)
  await expect(page.locator('#loading-screen')).toHaveClass(/hidden/, { timeout: 60000 })
  await expect(page.locator('#xr-quality-0')).toHaveText('Carretera · Quest')
  await expect(page.locator('#xr-quality-1')).toHaveText('100%')
  await expect(page.locator('#xr-quality-3')).toHaveText('No')
  await page.screenshot({ path: 'test-results/xr-quality.png' })
})
