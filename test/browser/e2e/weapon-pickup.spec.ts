import { test, expect } from '@playwright/test'

test('fixed pickup uses terrain beneath a station roof and follows terrain refinement', async ({
  page,
}) => {
  await page.route('**/pickup-roof', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body><canvas style="width:800px;height:600px"></canvas></body>',
    }),
  )
  await page.goto('/pickup-roof')
  const result = await page.evaluate(async (root) => {
    const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const floor = createEntity('floor', 'box', [0, 0.5, 0])
    floor.size = [30, 1, 30]
    const roof = createEntity('roof', 'box', [0, 5, 0])
    roof.size = [20, 1, 20]
    const runtime = new GameRuntime({
      canvas: document.querySelector('canvas')!,
      clock: 'manual',
      sea: false,
      audio: false,
      scene: {
        version: 1,
        name: 'Station',
        geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
        entities: [floor, roof, createEntity('spawn', 'spawn', [1, 1.7, 0])],
      },
    })
    await runtime.play()
    const internal = runtime as unknown as {
      options: { weaponPickupLocation?: { latitude: number; longitude: number; altitude: number } }
      world: unknown
      session: { simulation: import('../../../src/simulation/simulation').Simulation }
      placeInitialWeaponPickup(
        sim: import('../../../src/simulation/simulation').Simulation,
      ): Promise<void>
      syncPickupGround(
        sim: import('../../../src/simulation/simulation').Simulation,
        dt: number,
      ): void
      pickupModels: Map<string, import('three').Group>
    }
    internal.options.weaponPickupLocation = { latitude: 43.3, longitude: -2.9, altitude: 6 }
    let terrain = 1
    internal.world = { groundHeight: () => terrain }
    await internal.placeInitialWeaponPickup(internal.session.simulation)
    const first = runtime.worldPickups[0].position[1]
    terrain = 1.25
    internal.syncPickupGround(internal.session.simulation, 0.6)
    const refined = runtime.worldPickups[0].position[1]
    const visibleModelHeight = internal.pickupModels.get('initial-hk')!.position.y
    internal.world = undefined
    runtime.dispose()
    return { first, refined, visibleModelHeight }
  }, process.cwd())
  expect(result.first).toBeCloseTo(1.01, 3)
  expect(result.refined).toBeCloseTo(1.26, 3)
  expect(result.visibleModelHeight).toBeCloseTo(result.refined, 3)
})

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
      frames: { frameBusy: boolean }
      weaponDrawn: boolean
      session: {
        simulation: { player: { vehicleId: string | null }; startInVehicle(id: string): void }
      }
      pickupModels: Map<string, import('three').Group>
      cameraState: { mode: string; firstPerson: boolean; cinematicZoom: number; chaseZoom: number }
    }
    const initial = {
      owned: runtime.weaponOwned,
      pickups: runtime.worldPickups.length,
      model: internal.pickupModels.get('initial-hk')?.children.length ?? 0,
      height: runtime.worldPickups[0]?.position[1],
    }
    internal.action('KeyQ')
    const blocked = !internal.weaponDrawn
    internal.action('KeyE')
    const picked = {
      owned: runtime.weaponOwned,
      drawn: internal.weaponDrawn,
      pickups: runtime.worldPickups.length,
      vehicle: internal.session.simulation.player.vehicleId,
    }
    internal.session.simulation.startInVehicle('car')
    // The default pipelined physics worker publishes the boarding with a later step: run
    // animation frames until it does (inline physics has it at once).
    let now = performance.now()
    for (let i = 0; i < 120 && internal.session.simulation.player.vehicleId !== 'car'; i++) {
      runtime.tick((now += 1000 / 60))
      while (internal.frames.frameBusy) await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 1000 / 60))
    }
    const aboard = internal.session.simulation.player.vehicleId
    const boarded = { owned: runtime.weaponOwned, drawn: internal.weaponDrawn }
    document.querySelector('canvas')!.focus()
    internal.cameraState.mode = 'cinematic'
    document
      .querySelector('canvas')!
      .dispatchEvent(new WheelEvent('wheel', { deltaY: -2000, cancelable: true }))
    const zoom = internal.cameraState.cinematicZoom
    internal.cameraState.mode = 'chase'
    internal.cameraState.firstPerson = true
    document
      .querySelector('canvas')!
      .dispatchEvent(new WheelEvent('wheel', { deltaY: -1000, cancelable: true }))
    const chaseZoom = internal.cameraState.chaseZoom
    runtime.stop()
    const reset = !runtime.weaponOwned && runtime.worldPickups.length === 0
    runtime.dispose()
    return { initial, blocked, picked, boarded, aboard, zoom, chaseZoom, reset }
  }, process.cwd())
  expect(result.initial).toMatchObject({ owned: false, pickups: 1 })
  expect(result.initial.model).toBeGreaterThan(0)
  expect(result.initial.height).toBeCloseTo(1, 2)
  expect(result.blocked).toBe(true)
  expect(result.picked).toEqual({ owned: true, drawn: true, pickups: 0, vehicle: null })
  expect(result.boarded).toEqual({ owned: true, drawn: true })
  expect(result.aboard).toBe('car')
  expect(result.zoom).toBeLessThan(0.5)
  expect(result.chaseZoom).toBeLessThan(1)
  expect(result.reset).toBe(true)
})
