import { expect, test, localCircuit } from './studio-test.js'

test.beforeEach(async ({ page }) => {
  await localCircuit(page)
})

test('desktop retains the live viewport, edits and layout across panel moves', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?scene=circuit')
  await expect(page.locator('.studio-workspace #viewport > canvas')).toBeVisible()
  const world = await page.locator('#studio-viewport-panel').boundingBox()
  const sceneTree = await page.locator('.outliner').boundingBox()
  const properties = await page.locator('.inspector').boundingBox()
  expect(world!.x).toBeLessThan(sceneTree!.x)
  expect(sceneTree!.x).toBeCloseTo(properties!.x, 0)
  expect(sceneTree!.y + sceneTree!.height).toBeLessThanOrEqual(properties!.y)
  await expect(page.locator('.studio-viewport-tools [data-command=translate]')).toBeVisible()
  await expect(page.locator('#tree')).toBeVisible()
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
  await expect(page.locator('#name')).toHaveValue('S3 Nabla · 400 CV DSG')
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Rehacer', exact: true }).click()
  await expect(page.locator('#name')).toHaveValue('Desktop car')
  await page.getByRole('tab', { name: 'Vista 3D', exact: true }).click()
  await page
    .locator('[data-group=world-tabs]')
    .getByRole('button', { name: 'Flotar panel' })
    .click()
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-retained-test', 'original')
  await page.getByRole('button', { name: 'Ver', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Restablecer distribución' }).click()
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-retained-test', 'original')
  await page.getByRole('button', { name: 'Archivo', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Iniciar / detener prueba' }).click()
  await expect(page.locator('#mode-label')).toHaveText('Jugando')
  await page.getByRole('button', { name: 'Archivo', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Iniciar / detener prueba' }).click()
  await expect(page.locator('#name')).toHaveValue('Desktop car')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.screenshot({ path: 'test-results/desktop-studio.png' })
  await page.reload()
  await expect(page.locator('.studio-workspace #viewport > canvas')).toBeVisible()
  expect(errors).toEqual([])
})

test('invalid desktop layout cannot prevent opening the real editor', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nabla.studio.layout.v5', '{broken'))
  await page.goto('/?scene=circuit&studio=desktop')
  await expect(page.locator('.studio-workspace #viewport > canvas')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Propiedades', exact: true })).toBeVisible()
})

test('preferences keep sidebar sections and portals belong to the scene', async ({ page }) => {
  await page.goto('/?scene=circuit')
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Preferencias…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Preferencias' })
  await dialog.getByRole('tab', { name: 'Rendimiento', exact: true }).click()
  await expect(dialog.locator('#stream-mode')).toBeVisible()
  await expect(dialog.getByRole('tab', { name: 'Portales', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('tab', { name: 'Planeta', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cerrar preferencias' }).click()
  const side = page.locator('[data-group=properties-tabs]')
  await expect(side.getByRole('tab').nth(0)).toHaveText('Propiedades')
  await expect(side.getByRole('tab').nth(1)).toHaveText('Planeta')
  await side.getByRole('tab', { name: 'Planeta', exact: true }).click()
  await expect(page.locator('summary').filter({ hasText: /^Reloj$/ })).toBeVisible()
  await expect(page.locator('summary').filter({ hasText: /^Ubicación$/ })).toBeVisible()
  await expect(page.locator('summary').filter({ hasText: /^Mar$/ })).toBeVisible()
  await expect(page.locator('#sky-time')).toBeVisible()
  await expect(page.locator('#sky-hour')).toBeVisible()
  await expect(page.locator('#sky-apply')).toBeVisible()
  await expect(page.locator('#sky-live')).toBeVisible()
  await page.getByRole('combobox', { name: 'Organización de Escena' }).selectOption('class')
  await expect(page.locator('#tree')).toContainText('Portales')
})

test('the root URL and old style parameters always open the gray Desktop workspace', async ({
  page,
}) => {
  for (const url of ['/', '/?scene=circuit&studio=classic']) {
    await page.goto(url)
    await expect(page.locator('.studio-workspace #viewport > canvas')).toBeVisible()
    await expect(page.locator('.studio-preview-link')).toHaveCount(0)
    expect(await page.locator('#app').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(40, 40, 40)',
    )
  }
})

test('closed panels stay hidden and can be recovered through View', async ({ page }) => {
  await page.goto('/?scene=circuit')
  for (const group of ['properties-tabs', 'scene-tabs']) {
    const panel = page.locator(`[data-group="${group}"]`)
    await panel.locator('.nd-tabs').hover()
    await panel.getByRole('button', { name: 'Cerrar panel', exact: true }).click()
  }
  await expect(page.locator('.inspector')).toBeHidden()
  await expect(page.locator('.outliner')).toBeHidden()
  await page.getByRole('button', { name: 'Ver', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Propiedades', exact: true }).click()
  await expect(page.locator('.inspector')).toBeVisible()
  await page.getByRole('button', { name: 'Ver', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Escena', exact: true }).click()
  await expect(page.locator('.outliner')).toBeVisible()
  await page.getByRole('button', { name: 'Ver', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Restablecer distribución', exact: true }).click()
  await expect(page.locator('.inspector')).toBeVisible()
  await expect(page.locator('.outliner')).toBeVisible()
  await expect(page.locator('#viewport > canvas')).toBeVisible()
})

test('preferences opens inside the viewport on its first frame with a neutral titlebar', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  await page.evaluate(() => {
    const frames: { top: number; bottom: number; position: string }[] = []
    ;(window as any).__dialogFrames = frames
    const sample = () => {
      const dialog = document.querySelector('.studio-utility[open]')
      if (dialog) {
        const r = dialog.getBoundingClientRect()
        frames.push({ top: r.top, bottom: r.bottom, position: getComputedStyle(dialog).position })
      }
      if (frames.length < 12) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Preferencias…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Preferencias', exact: true })
  await expect(dialog).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as any).__dialogFrames.length)).toBe(12)
  const valid = await page.evaluate(() =>
    (window as any).__dialogFrames.every(
      (f: any) => f.position === 'fixed' && f.top >= 0 && f.bottom <= innerHeight,
    ),
  )
  expect(valid).toBe(true)
  const header = dialog.locator(':scope > header')
  await expect(header).toHaveCSS('background-color', 'rgb(32, 32, 32)')
  await expect(header.locator('svg')).toHaveCount(2)
  const before = await dialog.boundingBox(),
    handle = await header.boundingBox()
  await page.mouse.move(handle!.x + 70, handle!.y + 18)
  await page.mouse.down()
  await page.mouse.move(handle!.x + 130, handle!.y + 48, { steps: 5 })
  await page.mouse.up()
  const after = await dialog.boundingBox()
  expect(after!.x).toBeCloseTo(before!.x + 60, 0)
  expect(after!.y).toBeCloseTo(before!.y + 30, 0)
  await dialog.getByRole('button', { name: 'Cerrar preferencias' }).click()
  await expect(dialog).toHaveCount(0)
})
