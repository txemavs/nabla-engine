import { test, expect } from '@playwright/test'

test('adds original Stargates, persists modes and drives the A3 through a live view', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text()))
      errors.push(message.text())
  })
  await page.goto('/?scene=circuit')
  await page.locator('[popovertarget="cursor-menu"]').click()
  await page.locator('#cursor-x').fill('4')
  await page.locator('#cursor-y').fill('0')
  await page.locator('#cursor-z').fill('0')
  await page.locator('#cursor-apply').click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Añadir entidad', exact: true }).click()
  await page.locator('#sample-portals').click()
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded', {
    timeout: 20000,
  })
  await expect(page.locator('#portal-mode')).toHaveValue('closed')
  await page.locator('#portal-mode').selectOption('window')
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('nabla.scene.v1')))!)
  expect(
    saved.entities
      .filter((e: { portal?: unknown; parentId: string | null }) => e.portal && !e.parentId)
      .every((e: { portal: { mode: string } }) => e.portal.mode === 'window'),
  ).toBe(true)
  await page.locator('#portal-mode').selectOption('open')
  await page.locator('#welcome-close').click()
  await page.screenshot({ path: 'test-results/stargates-editor.png' })
  await page.locator('#play').click()
  await expect(page.locator('#interaction')).toContainText('E para entrar', { timeout: 10000 })
  await page.keyboard.press('KeyE')
  await expect(page.locator('#player-mode')).toContainText('AUDI')
  await page.keyboard.press('KeyC')
  await page.screenshot({ path: 'test-results/stargate-approach.png' })
  await page.keyboard.down('KeyW')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute(
    'data-portal-crossings',
    /[1-9]/,
    {
      timeout: 15000,
    },
  )
  await page.keyboard.up('KeyW')
  await expect(page.locator('#toast')).toHaveText('Stargate atravesado')
  await expect(page.locator('#player-mode')).toContainText('AUDI')
  await page.screenshot({ path: 'test-results/stargate-arrival.png' })
  await page.locator('#play').click()
  expect(errors).toEqual([])
})
