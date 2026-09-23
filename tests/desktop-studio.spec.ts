import { expect, test } from './studio-test.js'

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
  await page.getByRole('button', { name: 'Ver', exact: true }).click()
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

test('project settings keep flat tabs fixed and scroll only their content', async ({ page }) => {
  await page.goto('/?scene=circuit&studio=desktop')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-startup', 'ready')
  await page.getByRole('button', { name: 'Opciones', exact: true }).click()
  const tab = page.getByRole('tab', { name: 'Rendimiento', exact: true })
  await expect(tab).toBeVisible()
  expect(await tab.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('0px')
  const body = page.locator('.studio-settings-host .window-frame__body')
  expect(
    await body.evaluate((el) => ({
      overflow: getComputedStyle(el).overflowY,
      fits: el.scrollHeight <= el.clientHeight + 1,
    })),
  ).toEqual({ overflow: 'hidden', fits: true })
  await page.getByRole('tab', { name: 'Portales', exact: true }).click()
  await expect(page.locator('#settings-panel-portal-registry')).toBeVisible()
  await expect(page.locator('#portal-registry-list .portal-place h4').first()).toContainText(
    'Lugar actual',
  )
  expect(await body.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
  await page.getByRole('tab', { name: 'Ubicación', exact: true }).click()
  await expect(page.locator('#settings-panel-geography-section')).toBeVisible()
  await expect(page.locator('#settings-panel-portal-registry')).toBeHidden()
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
