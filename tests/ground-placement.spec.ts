import { test, expect } from './studio-test.js'
import { nativeMap } from './native-map.js'

test('arrivals, cursor and catalog vehicles use elevated terrain before Play', async ({ page }) => {
  await nativeMap(page, 600)
  await page.goto('/')
  await expect
    .poll(async () => Number(await page.locator('#cursor-y').inputValue()))
    .toBeGreaterThan(590)
  await expect
    .poll(async () => Number(await page.locator('#entity-altitude').inputValue()))
    .toBeGreaterThan(590)
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nabla.scene.v1')!))
  for (const id of ['car-a', 'carrier', 'spawn']) {
    const entity = saved.entities.find((e: { id: string }) => e.id === id)
    expect(entity.transform.position[1]).toBeGreaterThan(590)
    expect(entity.groundOffset).toBeGreaterThan(0)
  }
  await page.locator('#add-entity').click()
  await page.locator('#add-car').click()
  await expect
    .poll(async () => Number(await page.locator('#entity-altitude').inputValue()))
    .toBeGreaterThan(590)
  await page.locator('#entity-altitude').fill('900')
  await page.locator('#entity-altitude').press('Tab')
  await expect
    .poll(async () => Number(await page.locator('#entity-altitude').inputValue()))
    .toBeCloseTo(900, 1)
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  const authored = await page.evaluate(() => JSON.parse(localStorage.getItem('nabla.scene.v1')!))
  const added = authored.entities.find(
    (e: { kind: string; id: string }) =>
      e.kind === 'vehicle' && !['car-a', 'carrier'].includes(e.id),
  )
  expect(added.groundOffset).toBeUndefined()
  await page.reload()
  await expect
    .poll(async () => Number(await page.locator('#cursor-y').inputValue()))
    .toBeGreaterThan(590)
  await page.locator('#travel-menu-button').click()
  await page.locator('#travel-city').selectOption('40.4168,-3.7038')
  await page.locator('#travel-go').click()
  await expect(page.locator('#scene-name')).toHaveText('Madrid · Sol')
  await expect
    .poll(async () => Number(await page.locator('#cursor-y').inputValue()))
    .toBeGreaterThan(590)
  await expect
    .poll(async () => Number(await page.locator('#entity-altitude').inputValue()))
    .toBeGreaterThan(590)
})
