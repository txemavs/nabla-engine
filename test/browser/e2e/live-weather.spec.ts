import { expect, test } from '@playwright/test'

test('real weather drives runtime and panel, then restores manual controls without overwriting preferences', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.route('**/api/weather?*', (route) =>
    route.fulfill({
      json: {
        location: 'Bilbao test fixture',
        observedAt: Date.now(),
        cloud: 100,
        precipitation: 5,
        windKph: 36,
        windDegrees: 90,
        temperature: 12,
        condition: 'Rain',
        code: 1276,
      },
    }),
  )
  await page.route('**/live-weather-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/live-weather-check')
  const result = await page.evaluate(
    async (root) => {
      const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
      const { createPlanetSettingsPanel } = await import(
        `/@fs/${root}/src/runtime/planet-settings-panel.ts`
      )
      const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
      const canvas = document.createElement('canvas')
      canvas.style.cssText = 'width:320px;height:240px'
      document.body.append(canvas)
      const runtime = new GameRuntime({
        canvas,
        clock: 'manual',
        audio: false,
        sea: false,
        settings: { mode: 'pc', namespace: 'weather-test' },
        scene: {
          version: 1,
          name: 'Weather test',
          entities: [createEntity('spawn', 'spawn', [0, 1, 0])],
          geography: { latitude: 43.263, longitude: -2.935, altitude: 0, imagery: 'offline' },
        },
      })
      const panel = createPlanetSettingsPanel()
      document.body.append(panel.root)
      panel.bind(runtime)
      try {
        runtime.setRainAmount(0.23)
        runtime.setCloudStyle('low')
        runtime.setCloudWeather(0.2, 0.12)
        const saved = runtime.settings.getItem('nabla.planetVisual')
        const toggle = document.querySelector<HTMLInputElement>('#ps-real-weather')!
        toggle.click()
        for (let i = 0; i < 100; i++) {
          ;(runtime as any).updateWeather(performance.now())
          if ((runtime as any).liveVisuals) break
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        panel.refresh()
        const active = {
          rain: runtime.rainAmount,
          cloud: runtime.cloudAmount,
          style: runtime.cloudStyle,
          status: runtime.realWeatherStatus,
          wind: (runtime as any).liveVisuals?.wind,
          disabled: document.querySelector<HTMLInputElement>('#ps-rain')!.disabled,
          unchanged: runtime.settings.getItem('nabla.planetVisual') === saved,
        }
        toggle.click()
        panel.refresh()
        return {
          active,
          restored: {
            rain: runtime.rainAmount,
            cloud: runtime.cloudAmount,
            style: runtime.cloudStyle,
            enabled: runtime.realWeather,
            disabled: document.querySelector<HTMLInputElement>('#ps-rain')!.disabled,
          },
        }
      } finally {
        panel.destroy()
        runtime.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result.active.rain).toBeGreaterThan(0.5)
  expect(result.active.cloud).toBe(1)
  expect(result.active.style).toBe('artistic')
  expect(result.active.status).toContain('Bilbao test fixture')
  expect(result.active.wind.x).toBeCloseTo(-10)
  expect(result.active.disabled).toBe(true)
  expect(result.active.unchanged).toBe(true)
  expect(result.restored).toEqual({
    rain: 0.23,
    cloud: 0.2,
    style: 'low',
    enabled: false,
    disabled: false,
  })
})
