import { test, expect } from '@playwright/test'
test('a car uses GPS by default and retains an explicit local offset through saving', async ({
  page,
}) => {
  await page.goto('/?scene=circuit&studio=desktop')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-startup', 'ready')
  await expect(page.locator('[data-vector=position][data-axis="0"]')).toHaveValue('0')
  const latitude = await page.locator('#entity-latitude').inputValue()
  await page.locator('[data-vector=position][data-axis="0"]').fill('2')
  await page.locator('[data-vector=position][data-axis="0"]').press('Tab')
  await expect(page.locator('[data-vector=position][data-axis="0"]')).toHaveValue('2')
  await expect(page.locator('#entity-latitude')).toHaveValue(latitude)
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  const scene = await page.evaluate(() => JSON.parse(localStorage.getItem('nabla.scene.v1')!))
  expect(
    scene.entities.find((e: { id: string }) => e.id === 'car-a').geoAnchor.latitude,
  ).toBeCloseTo(Number(latitude), 6)
  await page.getByRole('button', { name: 'Ancla en la posición actual · XYZ a cero' }).click()
  await expect(page.locator('[data-vector=position][data-axis="0"]')).toHaveValue('0')
})
