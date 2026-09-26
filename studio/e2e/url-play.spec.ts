import { test, expect } from './studio-test.js'
import { nativeMap } from './native-map.js'
test('URL play opens the carrier cockpit and stopping restores editing', async ({ page }) => {
  await nativeMap(page, 600)
  await page.goto('/?lat=43.33&lon=-1.82&play')
  await expect(page.locator('body')).toHaveClass(/playing/, { timeout: 30000 })
  await expect(page.locator('#play')).toBeEnabled({ timeout: 30000 })
  await expect(page.locator('#player-mode')).toContainText(/vuelo|container|nave/i)
  await page.locator('#play').click()
  await expect(page.locator('body')).not.toHaveClass(/playing/)
})
