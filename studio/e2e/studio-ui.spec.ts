import { test, expect, localCircuit } from './studio-test.js'
import type { Page } from '@playwright/test'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { hasLocalPreset } from '../../test/local-presets.js'
async function command(page: Page, menu: string, id: string) {
  await page.locator('.studio-main-menu').getByRole('button', { name: menu, exact: true }).click()
  await page.locator('.desktop-menu-popup:popover-open [data-command="' + id + '"]').click()
}
test.beforeEach(async ({ page }) => {
  await localCircuit(page)
})
test('Vue properties, capabilities and planet settings persist through save and reload', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?scene=circuit')
  await page.locator('#name').fill('Vehículo de prueba')
  await page.locator('#name').press('Tab')
  await page.locator('#position-0').fill('6')
  await page.locator('#position-0').press('Tab')
  await expect(page.locator('#position-0')).toHaveValue('6')
  await page.getByRole('button', { name: 'Posición X · lock', exact: true }).click()
  await expect(page.locator('#position-0')).toHaveAttribute('readonly', '')
  await page.getByRole('button', { name: 'Posición X · unlock', exact: true }).click()
  await page.locator('[data-command=duplicate]').click()
  await expect(page.locator('#name')).toHaveValue('Vehículo de prueba · copia')
  await page.locator('[data-command=delete]').click()
  await command(page, 'Editar', 'undo')
  await expect(page.locator('#tree')).toContainText('Vehículo de prueba · copia')
  await page.locator('#tree [data-node-id=car-a]').click()
  await command(page, 'Editar', 'capability')
  await page.locator('#edit-capability-drive').click()
  await page.locator('#cap-engineForce').fill('8000')
  await page.locator('#cap-engineForce').press('Tab')
  await page.locator('#apply-capability').click()
  await command(page, 'Editar', 'preferences')
  const preferences = page.getByRole('dialog', { name: 'Preferencias' })
  await expect(preferences.getByRole('tab', { name: 'Planeta', exact: true })).toHaveCount(0)
  await preferences.getByRole('button', { name: 'Cerrar preferencias' }).click()
  await page
    .locator('[data-group=properties-tabs]')
    .getByRole('tab', { name: 'Planeta', exact: true })
    .click()
  await page.locator('summary').filter({ hasText: /^Mar$/ }).click()
  await page.locator('#water-level-number').fill('3.5')
  await page.locator('#water-level-number').press('Tab')
  await page.locator('#sky-time').fill('2026-09-29T12:00')
  await page.locator('#sky-apply').click()
  await page.getByRole('button', { name: 'Posición X · lock', exact: true }).click()
  await command(page, 'Archivo', 'save')
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('nabla.scene.v1')!).water?.level),
    )
    .toBe(3.5)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('nabla.scene.v1')!).entities.find(
            (e: { id: string }) => e.id === 'car-a',
          ).vehicle.engineForce,
      ),
    )
    .toBe(8000)
  await page.reload()
  await expect(page.locator('#name')).toHaveValue('Vehículo de prueba')
  await expect(page.locator('#position-0')).toHaveValue('6')
  await expect(page.locator('#position-0')).toHaveAttribute('readonly', '')
  await page
    .locator('[data-group=properties-tabs]')
    .getByRole('tab', { name: 'Planeta', exact: true })
    .click()
  await page.locator('summary').filter({ hasText: /^Mar$/ }).click()
  await expect(page.locator('#water-level-number')).toHaveValue('3.5')
  expect(errors).toEqual([])
})
test('portals are selected from Scene and expose their connection properties', async ({ page }) => {
  await page.goto('/?scene=circuit')
  await page
    .locator('.studio-view-header')
    .getByRole('button', { name: 'Añadir', exact: true })
    .click()
  await page.locator('.desktop-menu-popup:popover-open [data-command=sample-portals]').click()
  await expect(page.locator('#portal-mode')).toBeVisible()
  await expect(page.locator('#portal-mode')).toBeDisabled()
  const first = await page.locator('#entity-id').inputValue()
  await page
    .locator('.studio-view-header')
    .getByRole('button', { name: 'Añadir', exact: true })
    .click()
  await page.locator('.desktop-menu-popup:popover-open [data-command=sample-portals]').click()
  await page.locator('#portal-destination').selectOption(first)
  await page.locator('#portal-mode').selectOption('window')
  await expect(page.locator('#portal-mode')).toHaveValue('window')
  await expect(page.locator('#tree [aria-selected=true]')).toHaveCount(1)
  await command(page, 'Editar', 'preferences')
  await expect(
    page
      .getByRole('dialog', { name: 'Preferencias' })
      .getByRole('tab', { name: 'Portales', exact: true }),
  ).toHaveCount(0)
})

test('dragging a panel tab regroups it without replacing the 3D canvas', async ({ page }) => {
  await page.goto('/?scene=circuit')
  await page
    .locator('#viewport>canvas')
    .evaluate((node) => node.setAttribute('data-retained', 'yes'))
  const information = page.getByRole('tab', { name: 'Información', exact: true })
  const scene = page.getByRole('tab', { name: 'Escena', exact: true })
  await information.dragTo(scene)
  await expect(
    page.locator('[data-group=scene-tabs]').getByRole('tab', { name: 'Información', exact: true }),
  ).toBeVisible()
  await expect(page.locator('#viewport>canvas')).toHaveAttribute('data-retained', 'yes')
  await command(page, 'Ver', 'reset-layout')
  await expect(
    page.locator('[data-group=bottom-tabs]').getByRole('tab', { name: 'Información', exact: true }),
  ).toBeVisible()
})

test('Play toolbar starts on foot at the saved spawn and stops cleanly on the first load', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?scene=circuit')
  const canvas = page.locator('#viewport > canvas')
  const play = page.locator('.studio-view-header [data-command="play"]')
  await play.click()
  await expect(page.locator('body')).toHaveClass(/playing/)
  await expect(canvas).toHaveAttribute('data-vehicle', '')
  await expect(page.locator('#play')).toBeEnabled()
  // The first click must not take flightEntry, which teleports the carrier to the first car.
  await expect(canvas).toHaveAttribute('data-camera-mode', 'first-person')
  await play.click()
  await expect(page.locator('body')).not.toHaveClass(/playing/)
  await expect(page.locator('#play')).toBeEnabled()
  await command(page, 'Archivo', 'play')
  await expect(page.locator('body')).toHaveClass(/playing/)
  await expect(canvas).toHaveAttribute('data-vehicle', '')
  await expect(play).toBeEnabled()
  await page.keyboard.press('F8')
  await expect(page.locator('body')).not.toHaveClass(/playing/)
  expect(errors).toEqual([])
})

test('saved police equipment can be explicitly restored and saved without replacing its tuning', async ({
  page,
}) => {
  test.skip(!hasLocalPreset('police'), 'Needs the git-ignored assets/custom police preset')
  const car = presetVehicle('police', 'saved-police', [16, 1, -22])
  delete car.visual!.presentation
  car.vehicle!.engineForce = 7654
  await page.addInitScript((car) => {
    const doc = JSON.parse(localStorage.getItem('nabla.scene.v1')!)
    if (!doc.entities.some((e: { id: string }) => e.id === car.id)) {
      doc.entities.push(car)
      localStorage.setItem('nabla.scene.v1', JSON.stringify(doc))
    }
  }, car)
  await page.goto('/?scene=circuit')
  await page.locator('#tree [data-node-id=saved-police]').click()
  const equipment = page.locator('#vehicle-presentation')
  await expect(equipment).toHaveValue('')
  await equipment.selectOption('nabla.police')
  await expect(equipment).toHaveValue('nabla.police')
  await command(page, 'Archivo', 'save')
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('nabla.scene.v1')!).entities.find(
      (e: { id: string }) => e.id === 'saved-police',
    ),
  )
  expect(saved.visual.presentation).toBe('nabla.police')
  expect(saved.vehicle.engineForce).toBe(7654)
  expect(saved.transform.position).toEqual([16, 1, -22])
  await page.reload()
  await page.locator('#tree [data-node-id=saved-police]').click()
  await expect(equipment).toHaveValue('nabla.police')
})

test('Scene switches hierarchy and class trees with standard disclosure triangles', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const mode = page.getByRole('combobox', { name: 'Organización de Escena' })
  await expect(mode).toHaveValue('hierarchy')
  await expect(page.locator('#tree [data-node-id="car-a"]')).toBeVisible()
  await mode.selectOption('class')
  const vehicles = page.locator('#tree [data-node-id="class:Vehículos"]')
  await expect(vehicles).toHaveAttribute('aria-expanded', 'true')
  await expect(vehicles.locator('.nd-tree-triangle')).toBeVisible()
  await vehicles.locator('.nd-tree-icon').click()
  await expect(page.locator('#tree [data-node-id="car-a"]')).toHaveCount(0)
  await vehicles.locator('.nd-tree-icon').click()
  await page.locator('#tree [data-node-id="car-a"]').click()
  await mode.selectOption('hierarchy')
  await expect(page.locator('#tree [aria-selected=true]')).toHaveAttribute('data-node-id', 'car-a')
})

test('relative transform can cancel, apply and undo, and capability drafts cancel safely', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const before = await page.locator('#position-0').inputValue()
  async function openTransform() {
    await page
      .locator('.studio-view-header')
      .getByRole('button', { name: 'Objeto', exact: true })
      .click()
    await page.locator('.desktop-menu-popup:popover-open [data-command=exact-transform]').click()
  }
  await openTransform()
  await page.locator('#exact-amount').fill('2')
  await page.locator('#cancel-transform').click()
  await expect(page.locator('#position-0')).toHaveValue(before)
  await openTransform()
  await page.locator('#exact-space').selectOption('global')
  await page.locator('#exact-amount').fill('2')
  await page.locator('#apply-transform').click()
  await expect(page.locator('#position-0')).toHaveValue(String(Number(before) + 2))
  await command(page, 'Editar', 'undo')
  await expect(page.locator('#position-0')).toHaveValue(before)
  await command(page, 'Editar', 'capability')
  await page.locator('#edit-capability-drive').click()
  const force = await page.locator('#cap-engineForce').inputValue()
  await page.locator('#cap-engineForce').fill('1234')
  await page.locator('#cancel-capability').click()
  await command(page, 'Editar', 'capability')
  await page.locator('#edit-capability-drive').click()
  await expect(page.locator('#cap-engineForce')).toHaveValue(force)
  await expect(page.locator('#cap-flight')).toHaveCount(0)
  await page.locator('#cancel-capability').click()
})
