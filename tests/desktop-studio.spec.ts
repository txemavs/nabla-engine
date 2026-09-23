import { expect, test } from '@playwright/test'

test('desktop retains the live viewport, edits and layout across panel moves', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?scene=circuit&studio=desktop')
  await expect(page.locator('.studio-workspace #viewport > canvas')).toBeVisible()
  const world = await page.locator('#studio-viewport-panel').boundingBox()
  const sceneTree = await page.locator('.outliner').boundingBox()
  const properties = await page.locator('.inspector').boundingBox()
  expect(world!.x).toBeLessThan(sceneTree!.x)
  expect(sceneTree!.x).toBeCloseTo(properties!.x, 0)
  expect(sceneTree!.y + sceneTree!.height).toBeLessThanOrEqual(properties!.y)
  await expect(page.locator('#studio-viewport-panel > .toolbar #studio-object-mode')).toHaveValue(
    'object',
  )
  await expect(page.locator('.studio-viewport-tools #translate')).toBeVisible()
  await expect(page.locator('#studio-locations #tree')).toBeVisible()
  await page.evaluate(() => {
    const canvas = document.querySelector('#viewport > canvas')!
    canvas.setAttribute('data-retained-test', 'original')
  })
  await page.locator('#name').fill('Desktop car')
  await page.locator('#name').press('Tab')
  // Property editing must not toggle the simulation with a viewport shortcut.
  await page.locator('#name').focus()
  await page.keyboard.press('F8')
  await expect(page.locator('#mode-label')).toHaveText('Edición')
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Deshacer', exact: true }).click()
  await expect(page.locator('#name')).toHaveValue('Audi A3 Cabrio')
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Rehacer', exact: true }).click()
  await expect(page.locator('#name')).toHaveValue('Desktop car')
  await page.getByRole('tab', { name: 'Vista 3D', exact: true }).click()
  await page
    .locator('[data-group=world-tabs]')
    .getByRole('button', { name: 'Flotar panel' })
    .click()
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-retained-test', 'original')
  await page.getByRole('button', { name: 'Ventanas', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Restablecer distribución' }).click()
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-retained-test', 'original')
  await page.getByRole('button', { name: 'Ejecutar', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Iniciar / detener prueba' }).click()
  await expect(page.locator('#mode-label')).toHaveText('Jugando')
  await page.getByRole('button', { name: 'Ejecutar', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Iniciar / detener prueba' }).click()
  await expect(page.locator('#name')).toHaveValue('Desktop car')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.screenshot({ path: 'test-results/desktop-studio.png' })
  await page.reload()
  await expect(page.locator('.studio-workspace #viewport > canvas')).toBeVisible()
  expect(errors).toEqual([])
})

test('invalid desktop layout cannot prevent opening the real editor', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nabla.studio.layout.v2', '{broken'))
  await page.goto('/?scene=circuit&studio=desktop')
  await expect(page.locator('.studio-workspace #viewport > canvas')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Propiedades', exact: true })).toBeVisible()
})
