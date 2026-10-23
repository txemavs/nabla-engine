import { test, expect } from '@playwright/test'

test('calibrates a nonstandard wheel in the reusable panel and restores its profile', async ({
  page,
}) => {
  await page.route('**/usb-input-test', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/usb-input-test')
  const root = process.cwd().replaceAll('\\', '/')
  await page.evaluate(async (root) => {
    const { UsbControllers } = await import(`/@fs/${root}/src/runtime/usb/controllers.ts`)
    const { createUsbSettingsPanel } = await import(
      `/@fs/${root}/src/runtime/usb/settings-panel.ts`
    )
    const p = {
      id: 'Simulated USB wheel',
      index: 2,
      connected: true,
      mapping: '',
      axes: [0, 1, 1],
      buttons: Array.from({ length: 12 }, () => ({ pressed: false, touched: false, value: 0 })),
    }
    const state = { pad: p, hub: new UsbControllers(), panel: null as unknown }
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [null, null, state.pad],
    })
    const panel = createUsbSettingsPanel(state.hub)
    state.panel = panel
    document.body.append(panel.root)
    panel.refresh()
    Object.assign(window, { usbTest: state })
  }, root)
  await page.getByText('Ajustes avanzados y diagnóstico', { exact: true }).click()
  await expect(page.getByLabel('Dispositivo USB')).toContainText('Simulated USB wheel')
  await page
    .getByRole('button', { name: 'Cargar plantilla (requiere calibración)', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Calibrar', exact: true })).toHaveCount(3)
  await page.getByRole('button', { name: 'Exportar perfiles', exact: true }).click()
  const json = page.getByLabel('Perfiles USB JSON')
  expect(JSON.parse(await json.inputValue()).profiles.road.bindings).toHaveLength(3)
  await page.getByLabel('Control a asignar').selectOption('camera')
  await page.getByRole('button', { name: 'Mover / pulsar para asignar', exact: true }).click()
  await page.evaluate(() => {
    const s = (
      window as unknown as { usbTest: { pad: { buttons: { value: number; pressed: boolean }[] } } }
    ).usbTest
    s.pad.buttons[4].value = 1
    s.pad.buttons[4].pressed = true
  })
  await expect(page.locator('legend').filter({ hasText: 'Change camera · button 4' })).toHaveCount(
    1,
  )
  const result = await page.evaluate(async (root) => {
    const { UsbControllers } = await import(`/@fs/${root}/src/runtime/usb/controllers.ts`)
    const state = (
      window as unknown as {
        usbTest: {
          hub: InstanceType<typeof UsbControllers>
          pad: { axes: number[] }
          panel: { dispose(): void }
        }
      }
    ).usbTest
    const restored = new UsbControllers(),
      context = { mode: 'road' as const }
    restored.read(navigator.getGamepads(), context, true)
    state.pad.axes = [0.7, -1, 1]
    const input = restored.read(navigator.getGamepads(), context, true)
    state.panel.dispose()
    return {
      throttle: input.axes.throttle,
      steering: input.axes.steering,
      bindings: restored.snapshot.profiles.road.bindings.length,
      remaining: document.querySelectorAll('#settings-usb').length,
    }
  }, root)
  expect(result.throttle).toBe(1)
  expect(result.steering).toBeGreaterThan(0.6)
  expect(result.bindings).toBe(4)
  expect(result.remaining).toBe(0)
})

test('the real Engine runtime routes a nonstandard wheel and releases it on focus loss', async ({
  page,
}) => {
  await page.route('**/usb-runtime-test', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body><canvas width="800" height="600"></canvas></body>',
    }),
  )
  await page.goto('/usb-runtime-test')
  const result = await page.evaluate(
    async (root) => {
      const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
      const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
      const { presetVehicle } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
      const { defaultUsbSettings, usbTemplate, usbDeviceKey } = await import(
        `/@fs/${root}/src/runtime/usb/controllers.ts`
      )
      const floor = createEntity('floor', 'box', [0, -0.5, 0])
      floor.size = [30, 1, 30]
      const wheel = {
        id: 'Test wheel',
        index: 0,
        connected: true,
        mapping: '',
        axes: [0, 1, 1],
        buttons: [],
      }
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [wheel] })
      const runtime = new GameRuntime({
        canvas: document.querySelector('canvas')!,
        clock: 'manual',
        audio: false,
        sea: false,
        usb: { storage: null },
        scene: {
          version: 1,
          name: 'USB runtime',
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
        const state = runtime as any
        state.hasInput = () => true
        const settings = defaultUsbSettings()
        settings.profiles.road.bindings = usbTemplate('wheel', usbDeviceKey(wheel))
        runtime.usbControllers.configure(settings)
        state.pollGamepad()
        wheel.axes = [0.5, -1, 1]
        state.pollGamepad()
        const frame = state.usbFrame
        const input = runtime.game.readInput(1 / 60, { keys: new Set(), yaw: 0, usb: frame })
        runtime.releaseInput()
        state.pollGamepad()
        const released = state.usbFrame
        const { mountSettingsHud } = await import(`/@fs/${root}/game/settings-hud.ts`)
        const menu = mountSettingsHud(runtime)
        menu.open()
        const usbMenu = !!document.getElementById('settings-usb')
        menu.destroy()
        return {
          usbMenu,
          throttle: input.forward,
          steering: input.right,
          released: released.axes.throttle ?? 0,
        }
      } finally {
        runtime.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result.throttle).toBe(1)
  expect(result.steering).toBeGreaterThan(0.4)
  expect(result.released).toBe(0)
  expect(result.usbMenu).toBe(true)
})

test('the wheel wizard detects direction, tests the result and saves only after confirmation', async ({
  page,
}) => {
  await page.route('**/usb-wizard-test', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/usb-wizard-test')
  await page.evaluate(
    async (root) => {
      const { UsbControllers } = await import(`/@fs/${root}/src/runtime/usb/controllers.ts`)
      const { createUsbSettingsPanel } = await import(
        `/@fs/${root}/src/runtime/usb/settings-panel.ts`
      )
      const pad = {
        id: 'Wizard wheel',
        index: 0,
        connected: true,
        mapping: '',
        axes: [0],
        buttons: [],
      }
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] })
      const hub = new UsbControllers(null),
        panel = createUsbSettingsPanel(hub)
      document.body.append(panel.root)
      panel.refresh()
      Object.assign(window, { usbWizardTest: { pad, hub } })
    },
    process.cwd().replaceAll('\\', '/'),
  )
  await expect(page.getByLabel('Dispositivo USB')).not.toBeVisible()
  await page.getByRole('button', { name: 'Set up Wheel and pedals', exact: true }).click()
  await page.getByLabel('Acelerador y freno', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Empezar asistente', exact: true }).click()
  await page.getByRole('button', { name: 'Está en reposo', exact: true }).click()
  const move = async (value: number) => {
    await page.evaluate((v) => {
      ;(
        window as unknown as { usbWizardTest: { pad: { axes: number[] } } }
      ).usbWizardTest.pad.axes[0] = v
    }, value)
    await page.waitForTimeout(450)
  }
  await move(-1)
  await expect(page.getByText('Detectado: Wizard wheel', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Está en el tope', exact: true }).click()
  await move(1)
  await page.getByRole('button', { name: 'Está en el tope', exact: true }).click()
  await move(0)
  await page.getByRole('button', { name: 'Está de nuevo en reposo', exact: true }).click()
  await expect(
    page.getByText('Prueba de controles · mueve cada pieza y comprueba su respuesta.', {
      exact: true,
    }),
  ).toBeVisible()
  const before = await page.evaluate(
    () =>
      (
        window as unknown as {
          usbWizardTest: { hub: { snapshot: { profiles: { road: { bindings: unknown[] } } } } }
        }
      ).usbWizardTest.hub.snapshot.profiles.road.bindings.length,
  )
  expect(before).toBe(0)
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click()
  const result = await page.evaluate(
    () =>
      (
        window as unknown as {
          usbWizardTest: {
            hub: {
              snapshot: { profiles: { road: { bindings: { invert: boolean; target: string }[] } } }
            }
          }
        }
      ).usbWizardTest.hub.snapshot.profiles.road.bindings,
  )
  expect(result).toHaveLength(1)
  expect(result[0].target).toBe('steering')
  expect(result[0].invert).toBe(true)
  await page.getByRole('button', { name: 'Set up Wheel and pedals', exact: true }).click()
  await page.getByRole('button', { name: 'Empezar asistente', exact: true }).click()
  await page.getByRole('button', { name: 'Cancelar sin guardar', exact: true }).click()
  const cancelled = await page.evaluate(() => {
    const hub = (
      window as unknown as {
        usbWizardTest: {
          hub: { configuring: boolean; snapshot: { profiles: { road: { bindings: unknown[] } } } }
        }
      }
    ).usbWizardTest.hub
    return { bindings: hub.snapshot.profiles.road.bindings, configuring: hub.configuring }
  })
  expect(cancelled.bindings).toEqual(result)
  expect(cancelled.configuring).toBe(false)
})
