import { test, expect } from './studio-test.js'
import { nativeMap } from './native-map.js'
test('GPS URLs select the starting place and reuse saved objects without erasing other places', async ({
  page,
}) => {
  await nativeMap(page, 600)
  await page.goto('/?lat=41.5033&lon=-5.7446')
  await expect(page.locator('#scene-name')).toHaveText('41.50330, -5.74460')
  await expect
    .poll(async () => Number(await page.locator('#cursor-y').inputValue()))
    .toBeGreaterThan(590)
  await page.locator('#name').fill('Zamora saved car')
  await page.locator('#name').press('Tab')
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  await page.goto('/?scene=circuit&latitude=40.4168&longitude=-3.7038')
  await expect(page.locator('#scene-name')).toHaveText('40.41680, -3.70380')
  await page.goto('/?lon=-5.7446&lat=41.5033')
  await expect(page.locator('#name')).toHaveValue('Zamora saved car')
  await page.goto('/?lat=not-a-number&lon=0')
  await expect(page.locator('#name')).toHaveValue('Zamora saved car')
  await expect(page.locator('#toast')).toContainText('URL GPS no válida')
})

test('explicit URL altitude survives terrain loading and preserves saved object poses', async ({
  page,
}) => {
  await nativeMap(page, 600)
  await page.goto('/?lat=41.5033&lon=-5.7446&alt=1200')
  await expect
    .poll(async () => Number(await page.locator('#cursor-y').inputValue()))
    .toBeCloseTo(1200, 3)
  await expect
    .poll(async () => Number(await page.locator('#entity-altitude').inputValue()))
    .toBeCloseTo(1200.62, 1)
  await page.goto('/?lat=41.5033&lon=-5.7446&alt=1800')
  await expect
    .poll(async () => Number(await page.locator('#cursor-y').inputValue()))
    .toBeCloseTo(1800, 3)
  await expect
    .poll(async () => Number(await page.locator('#entity-altitude').inputValue()))
    .toBeCloseTo(1200.62, 1)
})
