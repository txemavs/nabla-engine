import { test, expect } from '@playwright/test'

test('edits a building clone, extrudes and deletes faces, undoes and persists topology', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?scene=circuit')
  await expect(page.locator('canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#welcome-close').click()
  await page.locator('[data-entity-id="architecture"]').click()
  await page.locator('[data-entity-id="building-0"]').click()
  await page.locator('#duplicate').click()
  await page.locator('#focus').click()
  await page.locator('#edit-solid').click()
  await expect(page.locator('.solid-tools')).toContainText('8 puntos · 12 líneas · 6 caras')
  await page.locator('#solid-selected-face').selectOption('3')
  await page.locator('#solid-distance').fill('2')
  await page.locator('#solid-extrude').click()
  await expect(page.locator('.solid-tools')).toContainText('12 puntos · 20 líneas · 10 caras')
  await page.locator('#solid-delete-face').click()
  await expect(page.locator('.solid-tools')).toContainText('9 caras')
  await page.locator('#undo').click()
  await expect(page.locator('.solid-tools')).toContainText('10 caras')
  await page.locator('#save').click()
  const entities = await page.evaluate(
    () => JSON.parse(localStorage.getItem('nabla.scene.v1')!).entities,
  )
  expect(entities.find((e: { id: string }) => e.id === 'building-0').geometry.faces).toHaveLength(6)
  expect(
    entities.find((e: { name: string }) => e.name === 'Edificio 1 · copia').geometry.faces,
  ).toHaveLength(10)
  await page.locator('#solid-extrude').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/solid-editor.png' })
  await page.reload()
  await page.locator('[data-entity-id="architecture"]').click()
  await page.getByRole('treeitem').filter({ hasText: 'Edificio 1 · copia' }).click()
  await page.locator('#edit-solid').click()
  await expect(page.locator('.solid-tools')).toContainText('10 caras')
  await page.locator('#play').click()
  await expect(page.locator('#mode-label')).toHaveText('Jugando')
  expect(errors).toEqual([])
})

test('draws points, an edge and a plane with viewport clicks', async ({ page }) => {
  await page.goto('/?scene=circuit')
  await expect(page.locator('canvas')).toHaveAttribute('data-assets', 'loaded')
  await page.locator('#welcome-close').click()
  await page.locator('#add-entity').click()
  await page.locator('#add-solid').click()
  await page.locator('#focus').click()
  await page.locator('#edit-solid').click()
  await page.locator('#solid-clear').click()
  await expect(page.locator('#solid-delete-point')).toBeDisabled()
  await expect(page.locator('#solid-face')).toBeDisabled()
  const canvas = page.locator('canvas'),
    bounds = await canvas.boundingBox()
  const a = { x: bounds!.width * 0.44, y: bounds!.height * 0.5 }
  const b = { x: bounds!.width * 0.56, y: bounds!.height * 0.5 }
  const c = { x: bounds!.width * 0.5, y: bounds!.height * 0.65 }
  await canvas.click({ position: a })
  await expect(page.locator('.solid-tools')).toContainText('1 puntos · 0 líneas · 0 caras')
  await page.locator('[data-mode="line"]').click()
  await canvas.click({ position: a })
  await canvas.click({ position: b })
  await expect(page.locator('.solid-tools')).toContainText('2 puntos · 1 líneas · 0 caras')
  await page.locator('[data-mode="face"]').click()
  await canvas.click({ position: a })
  await canvas.click({ position: b })
  await canvas.click({ position: c })
  await expect(page.locator('#solid-face')).toBeEnabled()
  await page.locator('#solid-face').click()
  await expect(page.locator('.solid-tools')).toContainText('3 puntos · 1 líneas · 1 caras')
  await page.locator('#solid-delete-point').click()
  await expect(page.locator('.solid-tools')).toContainText('0 caras')
  await page.locator('#undo').click()
  await expect(page.locator('.solid-tools')).toContainText('1 caras')
})
