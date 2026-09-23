import { test, expect } from './studio-test.js'
import { createSampleScene } from '../src/sample.js'

test('restored cursor and cursor placement become the editor orbit center', async ({ page }) => {
  const scene = createSampleScene()
  delete scene.geography
  scene.cursor = [1300, 450, -900]
  scene.cursorOnGround = false
  await page.addInitScript((value) => {
    localStorage.setItem('nabla.scene.v1', value)
  }, JSON.stringify(scene))
  await page.goto('/?scene=circuit')
  // "Cursor to view" reads the actual OrbitControls target back into the fields.
  const readTarget = async () =>
    page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('#cursor-view')!.click()
      return ['x', 'y', 'z'].map((axis) =>
        Number(document.querySelector<HTMLInputElement>(`#cursor-${axis}`)!.value),
      )
    })
  const initialTarget = await readTarget()
  initialTarget.forEach((value, i) => expect(value).toBeCloseTo(scene.cursor![i], 6))
  await page.evaluate(() => {
    for (const [i, axis] of ['x', 'y', 'z'].entries())
      document.querySelector<HTMLInputElement>(`#cursor-${axis}`)!.value = String(
        [1500, 600, -700][i],
      )
    document.querySelector<HTMLButtonElement>('#cursor-apply')!.click()
  })
  const movedTarget = await readTarget()
  movedTarget.forEach((value, i) => expect(value).toBeCloseTo([1500, 600, -700][i], 6))
})
