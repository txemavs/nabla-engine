import { test, expect } from '@playwright/test'

/** «Distancias»: one section in Configuración → Pantalla with every draw/fog/road/collision distance in km. */
test('distances section gathers existing and new controls and applies them live', async ({
  page,
}) => {
  await page.route('**/distances', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        '<!doctype html><body><canvas id="game-canvas"></canvas>' +
        '<details id="display-settings"><summary>Menú</summary>' +
        '<fieldset class="menu-section" id="display-quality-section"><legend>Calidad</legend></fieldset>' +
        '<fieldset class="menu-section" id="display-performance"><legend>Rendimiento</legend></fieldset>' +
        '<div id="menu-sections"></div></details></body>',
    }),
  )
  await page.goto('/distances')
  const result = await page.evaluate(async (root) => {
    const { menuSection } = await import(`/@fs/${root}/game/menu.ts`)
    const { bindDistances } = await import(`/@fs/${root}/game/distances-ui.ts`)
    const { mountSettingsHud } = await import(`/@fs/${root}/game/settings-hud.ts`)
    const { UsbControllers } = await import(`/@fs/${root}/src/runtime/usb/controllers.ts`)
    const { normalizeActionCamSettings } = await import(
      `/@fs/${root}/src/runtime/action-cam-settings.ts`
    )
    const { weaponPoseDefaults, sidearmTuningDefaults } = await import(
      `/@fs/${root}/src/config/gameplay-tuning.ts`
    )
    // Existing controls that move into the section: terrain draw distance and ground detail.
    const cache = menuSection('terrain-cache', 'Caché')
    const radius = document.createElement('label')
    radius.append('Radio de carga ')
    const radiusSelect = document.createElement('select')
    radiusSelect.id = 'terrain-cache-distance'
    radiusSelect.add(new Option('4 km', '4000'))
    radius.append(radiusSelect)
    cache.append(radius)
    const road = menuSection('road-style', 'Asfalto')
    const detail = document.createElement('label')
    detail.append('Distancia de detalle del suelo ')
    const detailSelect = document.createElement('select')
    detailSelect.id = 'ground-detail'
    detailSelect.add(new Option('1 (~1 km)', '1'))
    detail.append(detailSelect)
    road.append(detail)
    const visibility = {
      preset: 'custom',
      fog: 4000,
      roads: 1000,
      buildings: 1,
      collisions: 400,
      relief: 2,
    }
    const calls: object[] = []
    const stored = new Map<string, string>()
    const runtime = {
      visibility,
      setVisibility: (patch: object) => {
        calls.push(patch)
        Object.assign(visibility, patch)
      },
      usbControllers: new UsbControllers(null),
      getVehicleBeamCutoff: () => ({ low: 0, high: 1 }),
      vehicleLightAdjustment: null,
      setVehicleBeamCutoff: () => {},
      terrainTiles: [],
      actionCamEnabled: true,
      actionCamSettings: normalizeActionCamSettings({}),
      muzzleFlashTuning: { x: 0, y: 0, z: -72, intensity: 100 },
      tunnelEnabled: true,
      weaponPoseTuning: structuredClone(weaponPoseDefaults),
      smokePercent: 50,
      smokeEnabled: true,
      sidearmTuning: { ...sidearmTuningDefaults },
      setSidearmAimPreview: () => {},
      planetLayers: { sky: true, sun: true, clouds: true, sea: true },
      cloudStyle: 'low',
      cloudAmount: 0.35,
      cloudPressure: 0.12,
      lensFlareAmount: 1,
      sceneryPhysics: { enabled: true },
    }
    bindDistances(runtime as never, {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    })
    const untouched = calls.length
    mountSettingsHud(runtime as never)
    document.getElementById('settings-tab-options')!.click()
    ;(
      document.querySelector(
        '#settings-pane-options button[data-section="settings-distances"]',
      ) as HTMLElement
    ).click()
    const section = document.getElementById('settings-distances')!
    const fog = document.getElementById('distance-fog') as HTMLSelectElement
    fog.value = '8000'
    fog.dispatchEvent(new Event('change', { bubbles: true }))
    const roads = document.getElementById('distance-roads') as HTMLSelectElement
    return {
      untouched,
      hidden: section.hidden,
      group: section.closest('.menu-section') === section,
      navGroup: document
        .querySelector('#settings-pane-options button[data-section="settings-distances"]')!
        .closest('details')!
        .querySelector('summary')!.textContent,
      labels: [...section.querySelectorAll('label')].map((l) => l.textContent?.trim()),
      adopted: [radiusSelect, detailSelect].every((el) => section.contains(el)),
      roadOptions: [...roads.options].map((o) => o.textContent),
      fogOptions: [...fog.options].map((o) => o.textContent),
      calls,
      stored: [...stored.entries()],
    }
  }, process.cwd())
  expect(result.untouched).toBe(0)
  expect(result.hidden).toBe(false)
  expect(result.navGroup).toBe('Pantalla')
  expect(result.adopted).toBe(true)
  expect(result.labels[0]).toContain('Distancia de dibujo del terreno')
  expect(result.labels.some((label) => label?.startsWith('Niebla'))).toBe(true)
  expect(result.labels.at(-1)).toContain('Distancia de detalle del suelo')
  expect(result.fogOptions).toEqual(['500 m', '1 km', '2 km', '4 km', '8 km', '16 km'])
  expect(result.roadOptions[0]).toBe('Ocultas')
  expect(result.calls).toEqual([{ fog: 8000 }])
  expect(JSON.parse(result.stored[0][1])).toMatchObject({
    schema: 'nabla.visibility/1',
    preset: 'custom',
    values: { fog: 8000 },
  })
})
