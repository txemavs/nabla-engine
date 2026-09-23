import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createSampleScene } from '../src/sample.js'
import { createProject, visitLocation } from '../playground/studio/project.js'

test('named project files preserve multiple places and reopen the active place', async ({
  page,
}) => {
  await page.goto('/?scene=circuit&studio=desktop')
  const madrid = createSampleScene()
  madrid.name = 'Madrid studio'
  const irun = createSampleScene()
  irun.name = 'Irún studio'
  irun.entities.find((e) => e.id === 'car-a')!.name = 'Irún car'
  const project = visitLocation(createProject(madrid), irun)
  await page.locator('#file').setInputFiles({
    name: 'Trip.nabla.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  })
  await expect(page.locator('#scene-name')).toHaveText('Irún studio')
  await expect(page.locator('#name')).toHaveValue('Irún car')
  await page.locator('#file-menu-button').click()
  await page.locator('#save-as').click()
  await page.locator('#project-filename').fill('My cities')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar archivo', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('My cities.nabla.json')
  const saved = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(saved.locations.map((p: { scene: { name: string } }) => p.scene.name)).toEqual([
    'Madrid studio',
    'Irún studio',
  ])
  expect(saved.activeLocation).toBe('local:Irún studio')
  await page.locator('#file').setInputFiles({
    name: 'bad.nabla.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...saved, activeLocation: 'missing' })),
  })
  await expect(page.locator('#toast')).toContainText('Archivo no válido')
  await expect(page.locator('#scene-name')).toHaveText('Irún studio')
  await page.locator('#travel-menu-button').click()
  await page.locator('#project-places').selectOption('local:Madrid studio')
  await page.locator('#project-place-open').click()
  await expect(page.locator('#scene-name')).toHaveText('Madrid studio')
  await page.reload()
  await expect(page.locator('#scene-name')).toHaveText('Madrid studio')
})

test('Desktop options open a retained window with working keyboard accessible tabs', async ({
  page,
}) => {
  await page.goto('/?scene=circuit&studio=desktop')
  await expect(page.locator('.studio-workspace')).toBeVisible()
  await page.locator('#options-menu-button').click()
  await expect(page.getByRole('tab', { name: 'Rendimiento', exact: true })).toBeVisible()
  await page.locator('#draw-distance').selectOption('2000')
  await page.getByRole('tab', { name: 'Sol y luna', exact: true }).click()
  await expect(page.locator('#draw-distance')).toBeHidden()
  await expect(page.locator('#sky-time')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Ubicación', exact: true })).toBeFocused()
  await expect(page.locator('#latitude')).toBeVisible()
  await page.keyboard.press('F8')
  await expect(page.locator('#mode-label')).toHaveText('Edición')
  await page.getByRole('tab', { name: 'Rendimiento', exact: true }).click()
  await expect(page.locator('#draw-distance')).toHaveValue('2000')
  await page.screenshot({ path: 'test-results/studio-options.png' })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('#draw-distance')).toBeHidden()
  await page.locator('#options-menu-button').click()
  await expect(page.locator('#draw-distance')).toHaveValue('2000')
})
