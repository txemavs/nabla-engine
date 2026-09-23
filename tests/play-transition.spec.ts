import { test, expect } from './studio-test.js'

test('Play paints a busy state, ignores repeat activation and marks exit', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?scene=circuit')
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-startup', 'ready', {
    timeout: 60000,
  })
  const button = page.locator('#play')
  await expect(button).toBeEnabled({ timeout: 60000 })
  const entering = await page.evaluate(() => {
    const b = document.querySelector('#play') as HTMLButtonElement
    b.click()
    b.click()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8', bubbles: true }))
    return { busy: b.getAttribute('aria-busy'), disabled: b.disabled, text: b.textContent }
  })
  expect(entering).toEqual({ busy: 'true', disabled: true, text: 'Loading…' })
  await expect(page.locator('body')).toHaveClass(/playing/)
  await expect(button).toBeEnabled({ timeout: 60000 })
  const exiting = await page.evaluate(() => {
    const b = document.querySelector('#play') as HTMLButtonElement
    b.click()
    b.click()
    return { busy: b.getAttribute('aria-busy'), disabled: b.disabled, text: b.textContent }
  })
  expect(exiting).toEqual({ busy: 'true', disabled: true, text: 'Saliendo…' })
  await expect(page.locator('body')).not.toHaveClass(/playing/)
  expect(errors).toEqual([])
  await expect(button).toBeEnabled({ timeout: 60000 })
})
