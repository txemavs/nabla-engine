import { test, expect } from '@playwright/test'

/** The Ajustes window places every menu section in its tab, including sections bound later. */
test('settings HUD tabs: Planeta, Opciones, Rendimiento, Vídeo, Objetos, Desarrollo and late Tierra placement', async ({
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
    const { weaponPoseDefaults, sidearmTuningDefaults } = await import(
      `/@fs/${root}/src/config/gameplay-tuning.ts`
    )
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
    let sidearm = { ...sidearmTuningDefaults },
      preview = false
    const runtime = {
      actionCamEnabled: true,
      setActionCamEnabled: (enabled: boolean) => {
        runtime.actionCamEnabled = enabled
      },
      tunnelEnabled: true,
      setTunnelEnabled: () => {},
      weaponPoseTuning: structuredClone(weaponPoseDefaults),
      smokePercent: 50,
      smokeEnabled: true,
      setSmokeEnabled: (enabled: boolean) => {
        runtime.smokeEnabled = enabled
      },
      get sidearmTuning() {
        return sidearm
      },
      setSidearmTuning: (patch: Partial<typeof sidearm>) => (sidearm = { ...sidearm, ...patch }),
      setSidearmAimPreview: (on: boolean) => {
        preview = on
      },
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
    const actionCam = document.getElementById('camera-action-cam') as HTMLInputElement
    actionCam.checked = false
    actionCam.dispatchEvent(new Event('change', { bubbles: true }))
    const smoke = document.getElementById('quality-smoke') as HTMLInputElement
    smoke.checked = false
    smoke.dispatchEvent(new Event('change', { bubbles: true }))
    const height = document.getElementById('sidearm-aim-height') as HTMLInputElement
    height.value = '-33'
    height.dispatchEvent(new Event('input', { bubbles: true }))
    const angle = document.getElementById('sidearm-aim-angle') as HTMLInputElement
    angle.value = '0.7'
    angle.dispatchEvent(new Event('input', { bubbles: true }))
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
      [...document.getElementById(paneId)!.querySelectorAll('.menu-section')]
        .map((el) => el.id)
        .filter(Boolean)
    return {
      before,
      actionCam: runtime.actionCamEnabled,
      actionCamPane: pane('camera-action-cam'),
      cameraControls: ['camera-first-person-mode', 'camera-action-cam', 'quality-tunnel'].map(
        (id) => document.getElementById(id)?.closest('fieldset')?.id,
      ),
      smoke: runtime.smokeEnabled,
      smokePane: pane('quality-smoke'),
      sidearm,
      preview,
      weaponOutputs: [...document.querySelectorAll('#settings-options-sidearm output')].map(
        (el) => el.textContent,
      ),
      after: tabs(),
      planet: order('settings-pane-planet'),
      performance: order('settings-pane-performance'),
      video: order('settings-pane-video'),
      options: order('settings-pane-options'),
      dev: order('settings-pane-dev'),
      places: pane('layer-places'),
      placesGroup: document.getElementById('layer-places')?.closest('fieldset')?.id,
      road: pane('layer-road'),
      layersTitle: document.querySelector('#terrain-layers > legend')?.textContent,
      asphaltTitle: document.querySelector('#road-style > legend')?.textContent,
      copy: pane('ps-copy-config'),
      configText: document.getElementById('ps-config-out')?.textContent,
      planetHasCopy: !!document.querySelector('#settings-pane-planet #ps-copy-config'),
      sky: pane('ps-sky'),
      clouds: document.getElementById('ps-clouds')?.closest('fieldset')?.id,
      flare: document.getElementById('ps-lens-flare')?.closest('fieldset')?.id,
      vehicles: pane('vehicles'),
    }
  }, process.cwd())

  const visible = ['Planeta', 'Opciones', 'Rendimiento', 'Vídeo', 'Objetos', 'Desarrollo']
  expect(result.before).toEqual(visible)
  expect(result.actionCam).toBe(false)
  expect(result.actionCamPane).toBe('settings-pane-options')
  expect(result.cameraControls).toEqual(['camera-extras', 'camera-extras', 'camera-extras'])
  expect(result.smoke).toBe(false)
  expect(result.smokePane).toBe('settings-pane-performance')
  expect(result.sidearm).toEqual({ height: -0.055, angle: -0.5 })
  expect(result.preview).toBe(true)
  expect(result.weaponOutputs).toEqual(['-33 mm', '0.7°'])
  expect(result.after).toEqual(visible)
  expect(result.planet).toEqual([
    'terrain-position',
    'terrain-layers',
    'settings-planet-sea',
    'settings-planet-air',
    'settings-planet-sky',
  ])
  expect(result.performance).toEqual(['display-quality-section', 'display-performance'])
  expect(result.video).toEqual(['quality-shadows', 'road-style'])
  expect(result.options).toEqual(['camera-extras', 'driving-extras', 'settings-options-labels'])
  expect(result.dev.sort()).toEqual(
    [
      'settings-config-planet',
      'terrain-source',
      'settings-options-sidearm',
      'settings-weapon-poses',
    ].sort(),
  )
  expect(result.places).toBe('settings-pane-options')
  expect(result.placesGroup).toBe('settings-options-labels')
  expect(result.road).toBe('settings-pane-planet')
  expect(result.layersTitle).toBe('Tierra')
  expect(result.asphaltTitle).toBe('Postproceso')
  expect(result.copy).toBe('settings-pane-dev')
  expect(result.configText).toContain('cloudAmount=0.35')
  expect(result.planetHasCopy).toBe(false)
  expect(result.sky).toBe('settings-pane-planet')
  expect(result.clouds).toBe('settings-planet-air')
  expect(result.flare).toBe('settings-planet-sky')
  expect(result.vehicles).toBe('settings-pane-objects')
  await page.locator('#settings-toggle').click()
  await page.getByRole('tab', { name: 'Desarrollo' }).click()
  const branch = page
    .locator('#settings-pane-dev > details')
    .filter({ has: page.locator('summary', { hasText: /^Arma$/ }) })
  await expect(branch).not.toHaveAttribute('open', '')
  await branch.locator(':scope > summary').focus()
  await page.keyboard.press('Enter')
  await expect(branch).toHaveAttribute('open', '')
  await branch.getByText('Ajuste del apuntado', { exact: true }).first().click()
  await expect(page.locator('#sidearm-aim-height')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 740 })
  expect(
    await page.locator('#settings-window').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true)
  await page.screenshot({ path: '/tmp/settings-tree.png' })
})
