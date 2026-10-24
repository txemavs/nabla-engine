import { test, expect } from '@playwright/test'

test('runtime vehicle facade places, prepares, overrides lights and removes a live vehicle', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.route('**/vehicle-presentation-check', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<body><div><canvas width="640" height="480"></canvas></div></body>',
    }),
  )
  await page.goto('/vehicle-presentation-check')
  const result = await page.evaluate(
    async (root) => {
      const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
      const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
      const { presetVehicle } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
      const floor = createEntity('floor', 'box', [0, -0.5, 0])
      floor.size = [40, 1, 40]
      const runtime = new GameRuntime({
        canvas: document.querySelector('canvas')!,
        audio: false,
        sea: false,
        scene: {
          version: 1,
          name: 'Vehicle presentation',
          geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
          entities: [floor, createEntity('spawn', 'spawn', [0, 1, 0])],
        },
      })
      await runtime.setPlayerBody(null)
      try {
        await runtime.play()
        const template = presetVehicle('white-truck', 'truck', [0, 1, 0])
        const id = await runtime.placeVehicle(template, [5, 0, 0])
        const listed = runtime.spawnedVehicles.some((entry: { id: string }) => entry.id === id)
        const phases: string[] = []
        await runtime.prewarmVehicle(template, async (phase: string) => {
          phases.push(phase)
        })
        const resumed = runtime.session.state === 'playing'
        runtime.setVehiclePaint(id, '#204080')
        const lights = runtime.vehicleLightState(id)
        if (!lights) throw new Error('Mounted vehicle lights missing')
        const override = runtime.setVehicleLightState(id, {
          ...lights,
          powered: true,
          braking: true,
          reversing: false,
        })
        const restored = runtime.setVehicleLightState(id, null)
        runtime.removeSpawnedVehicle(id)
        return {
          listed,
          resumed,
          override,
          restored,
          removed: runtime.spawnedVehicles.length === 0,
          warmed: phases.includes('Vehicle ready'),
        }
      } finally {
        runtime.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result).toEqual({
    listed: true,
    resumed: true,
    override: true,
    restored: true,
    removed: true,
    warmed: true,
  })
})
