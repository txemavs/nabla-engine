import { expect, test, localCircuit } from './studio-test.js'

test('places objects and portals at a persistent cursor with exact axis movement', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await localCircuit(page)
  await page.goto('/?scene=circuit')
  await page.locator('[popovertarget="cursor-menu"]').click()
  await page.locator('#cursor-x').fill('12')
  await page.locator('#cursor-y').fill('2')
  await page.locator('#cursor-z').fill('-8')
  await page.locator('#cursor-apply').click()
  await page.keyboard.press('Escape')
  await page.locator('#add-entity').click()
  await page.locator('#add-solid').click()
  await expect(page.getByLabel('Posición respecto al padre · m X', { exact: true })).toHaveValue(
    '12',
  )
  await expect(page.getByLabel('Posición respecto al padre · m Y', { exact: true })).toHaveValue(
    '2',
  )
  await page.locator('[popovertarget="cursor-menu"]').click()
  await page.locator('#transform-axis').selectOption('X')
  await page.locator('#transform-amount').fill('2.75')
  await page.locator('#transform-exact').click()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Posición respecto al padre · m X', { exact: true })).toHaveValue(
    '14.75',
  )
  await page.locator('#undo').click()
  await expect(page.getByLabel('Posición respecto al padre · m X', { exact: true })).toHaveValue(
    '12',
  )
  await page.locator('#add-entity').click()
  await page.locator('#sample-portals').click()
  await expect(page.getByLabel('Posición respecto al padre · m X', { exact: true })).toHaveValue(
    '12',
  )
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nabla.scene.v1')!))
  expect(saved.cursor).toEqual([12, 2, -8])
  const portal = saved.entities.find((e: { name: string }) => e.name === 'Portal')
  expect(portal.transform.position).toEqual([12, 2, -8])
  expect(portal.portal.mode).toBe('closed')
  expect(portal.portal.pairId).toBeNull()
  await page.reload()
  await page.locator('[popovertarget="cursor-menu"]').click()
  await expect(page.locator('#cursor-x')).toHaveValue('12')
  await page.keyboard.press('Escape')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded')
  if (await page.locator('#welcome-close').isVisible()) await page.locator('#welcome-close').click()
  await page.screenshot({ path: 'test-results/world-cursor.png' })
  expect(errors).toEqual([])
})

test('restores the edited place after travelling to another city', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await localCircuit(page)
  await page.goto('/?scene=circuit')
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('nabla.scene.v1')!)
    localStorage.removeItem('nabla.project.v1')
    doc.geography = { latitude: 43.32969, longitude: -1.819606, altitude: 0, imagery: 'offline' }
    doc.name = 'Mi lugar de Irún'
    localStorage.setItem('nabla.scene.v1', JSON.stringify(doc))
    doc.geography = { latitude: 40.4168, longitude: -3.7038, altitude: 0, imagery: 'offline' }
    doc.name = 'Mi lugar de Madrid'
    localStorage.setItem('nabla-place:40.416800:-3.703800', JSON.stringify(doc))
  })
  await page.reload()
  await page.locator('#name').fill('Coche editado en Irún')
  await page.locator('#name').press('Tab')
  await page.locator('#travel-menu-button').click()
  await page.locator('#travel-city').selectOption('40.4168,-3.7038')
  await page.locator('#travel-go').click()
  await expect(page.locator('#scene-name')).toHaveText('Mi lugar de Madrid')
  await page.locator('#travel-menu-button').click()
  await page.locator('#travel-city').selectOption('43.32969,-1.819606')
  await page.locator('#travel-go').click()
  await expect(page.locator('#scene-name')).toHaveText('Mi lugar de Irún')
  await expect(page.locator('#name')).toHaveValue('Coche editado en Irún')
  expect(errors).toEqual([])
})

test('builds geometry from the cursor using exact point and edge extrusions', async ({ page }) => {
  await localCircuit(page)
  await page.goto('/?scene=circuit')
  await page.locator('#add-entity').click()
  await page.locator('#add-solid').click()
  await page.locator('#edit-solid').click()
  await page.locator('#solid-clear').click()
  await page.locator('#solid-cursor-point').click()
  await expect(page.locator('.solid-tools')).toContainText('1 puntos · 0 líneas · 0 caras')
  await page.locator('#solid-axis').selectOption('X')
  await page.locator('#solid-distance').fill('3')
  await page.locator('#solid-extrude-point').click()
  await expect(page.locator('.solid-tools')).toContainText('2 puntos · 1 líneas · 0 caras')
  await page.locator('#solid-axis').selectOption('Y')
  await page.locator('#solid-distance').fill('2.5')
  await page.locator('#solid-extrude-edge').click()
  await expect(page.locator('.solid-tools')).toContainText('4 puntos · 4 líneas · 1 caras')
  await page.locator('#solid-axis').selectOption('Z')
  await page.locator('#solid-distance').fill('0.2')
  await page.locator('#solid-extrude').click()
  await expect(page.locator('.solid-tools')).toContainText('8 puntos')
  await page.locator('#undo').click()
  await expect(page.locator('.solid-tools')).toContainText('4 puntos')
})
