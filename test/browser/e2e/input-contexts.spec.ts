import { test, expect } from '@playwright/test'

test('real keyboard routes forklift hydraulics, weapon priority and browser shortcuts without overlapping actions', async ({
  page,
}) => {
  await page.route('**/input-contexts', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body><canvas width="800" height="600"></canvas></body>',
    }),
  )
  await page.goto('/input-contexts')
  const result = await page.evaluate(
    async (root) => {
      const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
      const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
      const { presetVehicle } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
      const floor = createEntity('floor', 'box', [0, -0.5, 0])
      floor.size = [30, 1, 30]
      const canvas = document.querySelector('canvas')!
      const runtime = new GameRuntime({
        canvas,
        clock: 'manual',
        audio: false,
        sea: false,
        scene: {
          version: 1,
          name: 'Controls',
          geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
          entities: [
            floor,
            createEntity('spawn', 'spawn', [5, 1, 0]),
            presetVehicle('forklift-rc', 'toro', [0, 1, 0]),
          ],
        },
      })
      try {
        await runtime.play({ vehicleId: 'toro' })
        const internal = runtime as any
        internal.hasInput = () => true
        // This test exercises DOM keyboard routing, not browser pointer-lock permissions.
        internal.capturePointer = () => {}
        const sim = runtime.game.simulation!
        let now = performance.now()
        // Animation frames paced in real time: the default pipelined physics worker answers between
        // them, and the forklift pose read afterwards is its published state.
        const frames = async (count: number) => {
          for (let i = 0; i < count; i++) {
            runtime.tick((now += 1000 / 60))
            while (internal.frameBusy) await new Promise((resolve) => setTimeout(resolve, 0))
            await new Promise((resolve) => setTimeout(resolve, 1000 / 60))
          }
        }
        await frames(30)
        const initial = sim.forkliftPose('toro')!.tilt
        const press = (code: string, options: KeyboardEventInit = {}) => {
          const event = new KeyboardEvent('keydown', {
            code,
            bubbles: true,
            cancelable: true,
            ...options,
          })
          canvas.dispatchEvent(event)
          return event.defaultPrevented
        }
        const release = (code: string) =>
          window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
        press('KeyJ')
        await frames(30)
        release('KeyJ')
        const tilted = sim.forkliftPose('toro')!.tilt
        const view = internal.view
        let menuToggles = 0
        // A host can supply a monitor; J must never consume its hydraulic control.
        const original = view.toggleVehicleMenu.bind(view)
        view.toggleVehicleMenu = () => {
          menuToggles++
          return true
        }
        press('KeyJ')
        release('KeyJ')
        const afterJ = menuToggles
        press('KeyP')
        release('KeyP')
        const afterP = menuToggles
        view.toggleVehicleMenu = original
        const ctrlRPrevented = press('KeyR', { ctrlKey: true })
        const ctrlREnteredHeldSet = internal.keys.values.has('KeyR')
        // Route an aimed E through the real listener: it must not call interact.
        await runtime.play({ playerMode: 'walk' })
        const walking = runtime.game.simulation!
        const walkingMode = runtime.controlContext.mode
        internal.weaponDrawn = true
        internal.sidearm = { isAiming: true }
        let interactions = 0
        const interact = walking.interact.bind(walking)
        walking.interact = () => {
          interactions++
          return 'unexpected'
        }
        press('KeyE')
        release('KeyE')
        walking.interact = interact
        internal.sidearm = null
        internal.weaponDrawn = false
        return {
          initial,
          tilted,
          afterJ,
          afterP,
          ctrlRPrevented,
          ctrlREnteredHeldSet,
          interactions,
          walkingMode,
        }
      } finally {
        runtime.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result.tilted).toBeGreaterThan(result.initial)
  expect(result.afterJ).toBe(0)
  expect(result.afterP).toBe(1)
  expect(result.ctrlRPrevented).toBe(false)
  expect(result.ctrlREnteredHeldSet).toBe(false)
  expect(result.walkingMode).toBe('walk')
  expect(result.interactions).toBe(0)
})
