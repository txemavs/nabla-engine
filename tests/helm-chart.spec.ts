import { test, expect } from '@playwright/test'
test('GLB road chart draws without scene road entities and HUD sits above the world', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  await page.locator('#viewport > canvas').waitFor()
  const result = await page.evaluate(async () => {
    const chartModule = '/planet-chart.ts',
      helmModule = '/helm-map.ts'
    const { planetChart } = await import(chartModule)
    const { HelmMap, setPlanetCharts } = await import(helmModule)
    const chart = planetChart([
      {
        metadata: { category: 'Roads' },
        position: new Float32Array([-100, 0, -30, 100, 0, -30, 100, 0, 30, -100, 0, 30]),
        index: new Uint32Array([0, 1, 2, 0, 2, 3]),
      },
    ])
    setPlanetCharts(() => [
      { ...chart, matrix: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } },
    ])
    const canvas = document.createElement('canvas')
    new HelmMap(canvas).update(
      { version: 1, name: 'No legacy roads', entities: [] },
      { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      1000,
    )
    const pixel = [...canvas.getContext('2d')!.getImageData(270, 115, 1, 1).data]
    chart.bitmap.close()
    setPlanetCharts(() => [])
    return {
      pixel,
      hud: getComputedStyle(document.querySelector('#game-hud')!).zIndex,
      canvas: getComputedStyle(document.querySelector('#viewport > canvas')!).zIndex,
      pointer: getComputedStyle(document.querySelector('#game-hud')!).pointerEvents,
    }
  })
  expect(result.pixel).toEqual([84, 155, 211, 255])
  expect(Number(result.hud)).toBeGreaterThan(Number(result.canvas))
  expect(result.pointer).toBe('none')
})
