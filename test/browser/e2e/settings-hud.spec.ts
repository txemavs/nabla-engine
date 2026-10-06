import { test, expect } from '@playwright/test'

/** The Ajustes window places every menu section in its tab, including sections bound later. */
test('settings HUD tabs: Opciones, Configuración, Calidad and late Capas placement', async ({
  page,
}) => {
  await page.route('**/settings-hud', (route) =>
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
  await page.goto('/settings-hud')
  const result = await page.evaluate(async (root) => {
    const { menuSection } = await import(`/@fs/${root}/game/menu.ts`)
    const { mountSettingsHud } = await import(`/@fs/${root}/game/settings-hud.ts`)
    const check = (section: HTMLElement, id: string) => {
      const label = document.createElement('label')
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.id = id
      label.append(box, ' ' + id)
      section.append(label)
      return box
    }
    // Sections bound before the HUD, as drive.ts / terrain-main.ts do.
    check(menuSection('terrain-source', 'Terreno'), 'source')
    check(menuSection('terrain-position', 'Posición'), 'position')
    check(menuSection('camera-extras', 'Cámara'), 'flip')
    check(menuSection('driving-extras', 'Conducción'), 'recover-to-road')
    check(menuSection('road-style', 'Asfalto'), 'asphalt')
    check(menuSection('quality-shadows', 'Sombras'), 'shadows')
    check(menuSection('scene-vehicles', 'Vehículos'), 'vehicles')
    const layer = { sky: true, sun: true, clouds: true, sea: true }
    const runtime = {
      planetLayers: layer,
      setPlanetLayers: () => {},
      cloudStyle: 'low',
      setCloudStyle: () => {},
      cloudAmount: 0.35,
      cloudPressure: 0.12,
      setCloudWeather: () => {},
      lensFlareAmount: 1,
      setLensFlareAmount: () => {},
    }
    mountSettingsHud(runtime as never)
    const tabs = () =>
      [...document.querySelectorAll<HTMLElement>('.settings-tab')]
        .filter((tab) => !tab.hidden)
        .map((tab) => tab.textContent)
    const before = tabs()
    // The terrain game binds the layer list after the HUD mounts.
    const layers = menuSection('terrain-layers', 'Capas')
    for (const id of ['road', 'buildings', 'photo', 'places']) {
      check(layers, `layer-${id}`).dataset.layer = id
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    const pane = (id: string) => document.getElementById(id)?.closest('.settings-pane')?.id
    const order = (paneId: string) =>
      [...document.getElementById(paneId)!.children].map((el) => el.id).filter(Boolean)
    return {
      before,
      after: tabs(),
      quality: order('settings-pane-quality'),
      options: order('settings-pane-options'),
      config: order('settings-pane-config'),
      position: order('settings-pane-position'),
      places: pane('layer-places'),
      placesGroup: document.getElementById('layer-places')?.closest('fieldset')?.id,
      road: pane('layer-road'),
      copy: pane('ps-copy-config'),
      configText: document.getElementById('ps-config-out')?.textContent,
      planetHasCopy: !!document.querySelector('#settings-pane-planet #ps-copy-config'),
      vehicles: pane('vehicles'),
    }
  }, process.cwd())

  expect(result.before).toEqual([
    'Planeta',
    'Posición',
    'Calidad',
    'Vehículos',
    'Opciones',
    'Configuración',
  ])
  expect(result.after).toEqual([
    'Planeta',
    'Posición',
    'Calidad',
    'Capas',
    'Vehículos',
    'Opciones',
    'Configuración',
  ])
  expect(result.quality).toEqual([
    'display-quality-section',
    'display-performance',
    'quality-shadows',
    'road-style',
  ])
  expect(result.options).toEqual(['camera-extras', 'driving-extras', 'settings-options-labels'])
  expect(result.config).toEqual(['settings-config-planet', 'terrain-source'])
  expect(result.position).toEqual(['terrain-position'])
  expect(result.places).toBe('settings-pane-options')
  expect(result.placesGroup).toBe('settings-options-labels')
  expect(result.road).toBe('settings-pane-layers')
  expect(result.copy).toBe('settings-pane-config')
  expect(result.configText).toContain('cloudAmount=0.35')
  expect(result.planetHasCopy).toBe(false)
  expect(result.vehicles).toBe('settings-pane-vehicles')
})
