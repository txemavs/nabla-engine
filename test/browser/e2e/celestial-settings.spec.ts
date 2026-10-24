import { expect, test } from '@playwright/test'

test('celestial controls update the live sky independently, retain preferences and preserve horizon-only scaling', async ({
  page,
}) => {
  await page.route('**/celestial-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/celestial-check')
  const result = await page.evaluate(
    async (root) => {
      const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
      const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
      const { createPlanetSettingsPanel } = await import(
        `/@fs/${root}/src/runtime/planet-settings-panel.ts`
      )
      const make = (namespace: string) => {
        const parent = document.createElement('div'),
          canvas = document.createElement('canvas')
        parent.append(canvas)
        document.body.append(parent)
        return new GameRuntime({
          canvas,
          clock: 'manual',
          audio: false,
          sea: false,
          settings: { mode: 'pc', namespace },
          scene: {
            version: 1,
            name: 'Sky',
            geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
            entities: [createEntity('spawn', 'spawn', [0, 1, 0])],
          },
        })
      }
      const a = make('left'),
        b = make('right'),
        panel = createPlanetSettingsPanel()
      document.body.append(panel.root)
      panel.bind(a)
      const toggle = (id: string, checked: boolean) => {
        const input = document.getElementById(id) as HTMLInputElement
        input.checked = checked
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
      let c: any
      try {
        a.sky.atmosphere.space = 0
        a.sky.moonDirection.set(1, 0, 0)
        const scale = document.getElementById('ps-moon-horizon-scale') as HTMLInputElement
        scale.value = '4.5'
        scale.dispatchEvent(new Event('input', { bubbles: true }))
        const horizon = a.sky.moon.scale.x
        a.sky.moonDirection.set(0, 1, 0)
        a.setMoonHorizonScale(4.5)
        const overhead = a.sky.moon.scale.x
        a.sky.moonDirection.set(1, 0, 0)
        a.sky.atmosphere.space = 1
        a.setMoonHorizonScale(4.5)
        const space = a.sky.moon.scale.x
        toggle('ps-sky', false)
        const atmosphereOff = [a.sky.backdrop.visible, a.sky.moon.visible, a.sky.night.root.visible]
        toggle('ps-stars', false)
        const moonStillVisible = a.sky.moon.visible
        toggle('ps-moon', false)
        const disabled = scale.disabled
        const output = document.getElementById('ps-moon-horizon-scale-val')?.textContent
        c = make('left')
        return {
          horizon,
          overhead,
          space,
          atmosphereOff,
          moonStillVisible,
          disabled,
          output,
          restored: [c.moonHorizonScale, c.planetLayers.moon, c.planetLayers.stars],
          survivor: [b.moonHorizonScale, b.planetLayers.moon, b.planetLayers.stars],
          exported: panel.snapshot(),
        }
      } finally {
        panel.destroy()
        a.dispose()
        b.dispose()
        c?.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result).toMatchObject({
    horizon: 4.5,
    overhead: 1,
    space: 1,
    atmosphereOff: [false, true, true],
    moonStillVisible: true,
    disabled: true,
    output: '4.5×',
    restored: [4.5, false, false],
    survivor: [5, true, true],
    exported: { moon: false, stars: false, moonHorizonScale: 4.5 },
  })
})
