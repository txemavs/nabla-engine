import { test, expect } from '@playwright/test'

test('HK begins on the ground, can only be collected on foot, and survives boarding', async ({
  page,
}) => {
  await page.route('**/weapon-pickup', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body style="margin:0"><canvas width="800" height="600"></canvas></body>',
    }),
  )
  await page.goto('/weapon-pickup')
  const result = await page.evaluate(async (root) => {
    const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const { presetVehicle } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
    const floor = createEntity('floor', 'box', [0, 0.5, 0])
    floor.size = [100, 1, 100]
    const runtime = new GameRuntime({
      canvas: document.querySelector('canvas')!,
      clock: 'manual',
      sea: false,
      audio: false,
      weaponPickupNearVehicle: true,
      scene: {
        version: 1,
        name: 'Pickup',
        geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
        entities: [
          floor,
          createEntity('spawn', 'spawn', [-2.6, 1.7, 0.6]),
          presetVehicle('car', 'car', [0, 1.7, 0]),
        ],
      },
    })
    await runtime.play()
    const internal = runtime as unknown as {
      action(code: string): void
      weaponDrawn: boolean
      session: {
        simulation: { player: { vehicleId: string | null }; startInVehicle(id: string): void }
      }
      pickupModels: Map<string, import('three').Group>
      cameraState: { mode: string; cinematicZoom: number; chaseZoom: number }
    }
    const initial = {
      owned: runtime.weaponOwned,
      pickups: runtime.worldPickups.length,
      model: internal.pickupModels.get('initial-hk')?.children.length ?? 0,
      height: runtime.worldPickups[0]?.position[1],
    }
    internal.action('Tab')
    const blocked = !internal.weaponDrawn
    internal.action('KeyE')
    const picked = {
      owned: runtime.weaponOwned,
      drawn: internal.weaponDrawn,
      pickups: runtime.worldPickups.length,
      vehicle: internal.session.simulation.player.vehicleId,
    }
    internal.session.simulation.startInVehicle('car')
    const boarded = { owned: runtime.weaponOwned, drawn: internal.weaponDrawn }
    document.querySelector('canvas')!.focus()
    internal.cameraState.mode = 'cinematic'
    document
      .querySelector('canvas')!
      .dispatchEvent(new WheelEvent('wheel', { deltaY: -2000, cancelable: true }))
    const zoom = internal.cameraState.cinematicZoom
    runtime.stop()
    const reset = !runtime.weaponOwned && runtime.worldPickups.length === 0
    runtime.dispose()
    return { initial, blocked, picked, boarded, zoom, reset }
  }, process.cwd())
  expect(result.initial).toMatchObject({ owned: false, pickups: 1 })
  expect(result.initial.model).toBeGreaterThan(0)
  expect(result.initial.height).toBeCloseTo(1, 2)
  expect(result.blocked).toBe(true)
  expect(result.picked).toEqual({ owned: true, drawn: true, pickups: 0, vehicle: null })
  expect(result.boarded).toEqual({ owned: true, drawn: true })
  expect(result.zoom).toBeLessThan(0.5)
  expect(result.reset).toBe(true)
})
