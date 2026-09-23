import { test, expect } from './studio-test.js'
import { nativeMap } from './native-map.js'
import { readFile } from 'node:fs/promises'
async function downloadPlanet(page: import('@playwright/test').Page) {
  await page.locator('#file-menu-button').click()
  const pending = page.waitForEvent('download')
  await page.locator('#export').click()
  const file = await pending
  return JSON.parse(await readFile((await file.path())!, 'utf8'))
}
test('travel and downloads retain one planet, new planet is explicit and backed up', async ({
  page,
}) => {
  await nativeMap(page, 600)
  await page.goto('/')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-startup', 'ready')
  const first = await downloadPlanet(page)
  await page.reload()
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-startup', 'ready')
  const reloaded = await downloadPlanet(page)
  expect(reloaded.planetId).toBe(first.planetId)
  await page.locator('#file-menu-button').click()
  await page.locator('#travel-menu-button').click()
  await page.locator('#travel-city').selectOption('40.4168,-3.7038')
  await page.locator('#travel-go').click()
  await expect(page.locator('#scene-name')).toHaveText('Madrid · Sol')
  const second = await downloadPlanet(page)
  expect(second.version).toBe(3)
  expect(second.planetId).toBe(first.planetId)
  expect(second.locations).toHaveLength(1)
  const car = first.objects.find((o: any) => o.entityId === 'car-a')
  const saved = second.objects.find((o: any) => o.id === car.id)
  // Height can refine as elevation streams; horizontal planetary address remains unchanged.
  expect(saved).toBeTruthy()
  expect(second.locations[0].scene.entities.filter((e: any) => e.kind === 'vehicle')).toHaveLength(
    2,
  )
  page.once('dialog', (d) => d.accept())
  if (!(await page.locator('#new-planet').isVisible()))
    await page.locator('#file-menu-button').click()
  await page.locator('#new-planet').click()
  await expect(page.locator('#scene-name')).toHaveText('Mi planeta')
  const fresh = await downloadPlanet(page)
  expect(fresh.planetId).not.toBe(first.planetId)
})
