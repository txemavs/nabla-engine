import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
test('settings files are previewed before import, export excludes unrelated data, reset requires confirmation', async ({
  page,
}) => {
  await page.route('**/settings-management-test', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/settings-management-test')
  await page.evaluate(
    async (root) => {
      const { createSettingsManagement } = await import(`/@fs/${root}/game/settings-management.ts`)
      const { defaultUsbSettings } = await import(`/@fs/${root}/src/runtime/usb/controllers.ts`)
      localStorage.setItem('nabla.cameraFov', '20')
      localStorage.setItem('nabla.usb.controllers.v1', JSON.stringify(defaultUsbSettings()))
      localStorage.setItem('token', 'private')
      localStorage.setItem('nabla.terrain.cache', 'keep')
      Object.assign(window, { reloads: [] })
      const panel = createSettingsManagement(document, {
        local: () => localStorage,
        session: () => sessionStorage,
        search: () => '?tile=1/2&quality=mobile',
        reload: (s: string) => (window as unknown as { reloads: string[] }).reloads.push(s),
      })
      document.body.append(panel)
    },
    process.cwd().replaceAll('\\', '/'),
  )
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar todos los ajustes en JSON', exact: true }).click()
  const file = await downloaded,
    backup = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(backup.local['nabla.cameraFov']).toBe('20')
  expect(backup.local.token).toBeUndefined()
  expect(backup.local['nabla.terrain.cache']).toBeUndefined()
  expect(backup.query).toEqual({ quality: 'mobile' })
  const invalid = { ...backup, local: { token: 'bad' } }
  await page
    .getByLabel('Archivo JSON de ajustes')
    .setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(invalid)),
    })
  await expect(page.getByRole('status')).toContainText('No se ha importado nada')
  expect(await page.evaluate(() => localStorage.getItem('nabla.cameraFov'))).toBe('20')
  const imported = { ...backup, local: { 'nabla.cameraFov': '30' } }
  await page
    .getByLabel('Archivo JSON de ajustes')
    .setInputFiles({
      name: 'settings.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(imported)),
    })
  await expect(
    page.getByRole('button', { name: 'Aplicar ajustes y recargar', exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('nabla.cameraFov'))).toBe('20')
  await page.getByRole('button', { name: 'Cancelar importación', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('nabla.cameraFov'))).toBe('20')
  await page
    .getByLabel('Archivo JSON de ajustes')
    .setInputFiles({
      name: 'settings.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(imported)),
    })
  await page.getByRole('button', { name: 'Aplicar ajustes y recargar', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('nabla.cameraFov'))).toBe('30')
  expect(await page.evaluate(() => localStorage.getItem('nabla.usb.controllers.v1'))).toBeTruthy()
  await page
    .getByRole('button', { name: 'Restablecer valores predeterminados…', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Confirmar restablecimiento y recargar', exact: true }),
  ).toBeDisabled()
  expect(await page.evaluate(() => localStorage.getItem('nabla.cameraFov'))).toBe('30')
  await page.getByLabel('Entiendo qué ajustes se van a restablecer').check()
  await page
    .getByRole('button', { name: 'Confirmar restablecimiento y recargar', exact: true })
    .click()
  const result = await page.evaluate(() => ({
    camera: localStorage.getItem('nabla.cameraFov'),
    usb: localStorage.getItem('nabla.usb.controllers.v1'),
    cache: localStorage.getItem('nabla.terrain.cache'),
    token: localStorage.getItem('token'),
    reloads: (window as unknown as { reloads: string[] }).reloads,
  }))
  expect(result.camera).toBe(null)
  expect(result.usb).toBeTruthy()
  expect(result.cache).toBe('keep')
  expect(result.token).toBe('private')
  expect(result.reloads).toHaveLength(2)
  expect(result.reloads[1]).toBe('tile=1%2F2')
})
