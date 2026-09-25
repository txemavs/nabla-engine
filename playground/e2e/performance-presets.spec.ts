import { test, expect } from './studio-test.js'
test('five presets persist their visual settings and cap speculative demand', async ({ page }) => {
  await page.goto('/geography/geoeuskadi-pilot/manifest.json')
  const values = await page.evaluate(async () => {
    const m = await import(String('/performance.ts'))
    return Object.entries(m.performancePresets).map(([id, value]) => {
      const preset = value as { settings: object; cache: number; concurrent: number }
      localStorage.setItem(
        'nabla.performance.v1',
        JSON.stringify({ ...preset.settings, preset: id }),
      )
      return { ...m.readPerformance(), cache: preset.cache, concurrent: preset.concurrent }
    })
  })
  expect(values).toHaveLength(5)
  expect(values[0]).toMatchObject({ preset: 'mobile', shadows: 0, buildings: 0, cache: 25 })
  expect(values[4]).toMatchObject({ preset: 'ultra', distance: 20000, cache: 100, concurrent: 3 })
  await page.reload()
  const saved = await page.evaluate(async () =>
    (await import(String('/performance.ts'))).readPerformance(),
  )
  expect(saved.preset).toBe('ultra')
  expect(saved.distance).toBe(20000)
})
