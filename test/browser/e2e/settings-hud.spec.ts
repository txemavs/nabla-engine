import { test, expect, type Page } from '@playwright/test'

/** Expand every section group of the settings tree, so a grouped section's button can be clicked. */
async function openNavGroups(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const group of document.querySelectorAll<HTMLDetailsElement>('.settings-nav-group'))
      group.open = true
  })
}

/** The Ajustes window places every menu section in its tab, including sections bound later. */
test('full-screen settings preserves controls, keyboard catalog and late terrain sections', async ({
  page,
}) => {
  await page.route('**/settings-hud', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        '<!doctype html><body><canvas id="game-canvas"></canvas>' +
        '<details id="display-settings"><summary>Menú</summary>' +
        '<fieldset class="menu-section" id="display-quality-section"><legend>Calidad</legend></fieldset>' +
        '<div id="menu-sections"></div></details></body>',
    }),
  )
  await page.goto('/settings-hud')
  const result = await page.evaluate(async (root) => {
    const moduleRoot = `/@fs/${root.replace(/^\/+/, '')}`
    const { UsbControllers } = await import(`${moduleRoot}/src/runtime/usb/controllers.ts`)
    const { menuSection } = await import(`${moduleRoot}/game/menu.ts`)
    const { mountSettingsHud } = await import(`${moduleRoot}/game/settings-hud.ts`)
    const { normalizeActionCamSettings } = await import(
      `${moduleRoot}/src/runtime/action-cam-settings.ts`
    )
    const { weaponPoseDefaults, sidearmTuningDefaults } = await import(
      `${moduleRoot}/src/config/gameplay-tuning.ts`
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
    // Sections bound before the HUD, as game-page.ts / terrain-main.ts do.
    check(menuSection('terrain-source', 'Terrain'), 'source')
    check(menuSection('terrain-position', 'Position'), 'position')
    check(menuSection('camera-extras', 'Camera'), 'flip')
    check(menuSection('driving-extras', 'Driving'), 'recover-to-road')
    check(menuSection('road-style', 'Asfalto'), 'asphalt')
    check(menuSection('quality-shadows', 'Sombras'), 'shadows')
    check(
      menuSection('settings-experimental-light-shadows', 'Experimental shadows'),
      'lamp-shadows',
    )
    check(menuSection('scene-vehicles', 'Vehicles'), 'vehicles')
    const lightSection = menuSection('settings-light', 'Light')
    check(lightSection, 'light-shadows')
    check(lightSection, 'light-shadowIntensity')
    const qualitySection = document.getElementById('display-quality-section')!
    for (const id of [
      'display-quality',
      'display-scale',
      'display-scale-auto',
      'display-fsr',
      'display-fsr-sharpness',
    ])
      check(qualitySection, id)
    check(menuSection('anisotropy-test', 'Anisotropy'), 'anisotropy')
    // Bound by exhaust-ui.ts in the game; rows carry data-exhaust-group.
    const exhaust = menuSection('settings-truck-exhaust', 'Vehicle · exhaust and smoke')
    const exhaustRow = document.createElement('label')
    exhaustRow.dataset.exhaustGroup = 'position'
    exhaustRow.textContent = 'Escape posición'
    exhaust.append(exhaustRow)
    const layer = { sky: true, sun: true, clouds: true, sea: true }
    let sidearm = { ...sidearmTuningDefaults },
      preview = false
    const runtime = {
      cameraMotionPreferences: {
        autoCenter: true,
        autoCenterDelayMs: 10000,
        autoCenterBlendMs: 500,
        modeTransitionMs: 700,
      },
      setCameraMotionPreferences(patch: object) {
        Object.assign(this.cameraMotionPreferences, patch)
        return { ...this.cameraMotionPreferences }
      },
      sunShadowQualityOverride: null,
      saveSunShadowQuality() {},
      inputPreferences: {
        mouseSensitivity: 1,
        invertMouseY: false,
        steeringRiseSeconds: 0.4,
        steeringReleaseSeconds: 0.12,
        gamepadDeadzone: 0.12,
      },
      setInputPreferences(patch: object) {
        Object.assign(this.inputPreferences, patch)
        return { ...this.inputPreferences }
      },
      settings: localStorage,
      skyClock: { mode: 'fixed', at: new Date(2026, 9, 16, 12, 30).toISOString() } as {
        mode: 'fixed'
        at: string
      },
      setSkyClock: (clock: { mode: 'fixed'; at: string }) => {
        runtime.skyClock = clock
      },
      usbControllers: new UsbControllers(null),
      getVehicleBeamCutoff: () => ({ low: 0, high: 1 }),
      vehicleLightAdjustment: {
        model: '/test-bike.glb',
        name: 'Moto de prueba',
        lamps: { front: true, rear: true },
        values: {
          low: 0,
          high: 1,
          frontX: 0,
          frontY: 0,
          frontZ: 0,
          rearX: 0,
          rearY: 0,
          rearZ: 0,
          rearIntensity: 1,
          rearReach: 1,
        },
      },
      occupiedVehicle: {
        id: 'test-bike',
        name: 'Moto de prueba',
        model: '/test-bike.glb',
        lamps: { front: true, rear: true },
        mirrors: true,
        exhaust: false,
        options: {
          lamps: { front: true, rear: true },
          mirrors: true,
          exhaust: null,
          sound: { engine: true, reverseAlarm: false },
        },
      } as { name: string; options: object },
      audioMix: { master: 1, engine: 0.5, music: 1, musicMuted: false },
      setAudioMix: (patch: object) => {
        Object.assign(runtime.audioMix, patch)
        return runtime.audioMix
      },
      cameraFovRange: { min: -20, max: 20 },
      cameraFovOffset: 0,
      setCameraFovOffset: (offset: number) => (runtime.cameraFovOffset = offset),
      weaponWheelResets: 0,
      resetWeaponWheel: () => {
        runtime.weaponWheelResets++
      },
      reverseAlarmEnabled: true,
      setReverseAlarmEnabled: (enabled: boolean) => {
        runtime.reverseAlarmEnabled = enabled
      },
      setVehicleLightAdjustment: (patch: object) => {
        Object.assign(runtime.vehicleLightAdjustment.values, patch)
      },
      setVehicleBeamCutoff: () => {},
      terrainTiles: [
        { tile: { z: 15, x: 16224, y: 11998 }, kind: 'mesh', state: 'visible' },
        { tile: { z: 15, x: 16230, y: 12003 }, kind: 'mesh', state: 'downloading' },
      ],
      actionCamEnabled: true,
      actionCamSettings: normalizeActionCamSettings({}),
      setActionCamSettings: (patch: object) => {
        runtime.actionCamSettings = normalizeActionCamSettings({
          ...runtime.actionCamSettings,
          ...patch,
        })
      },
      resetActionCamSettings: () => {
        runtime.actionCamSettings = normalizeActionCamSettings({})
      },
      setActionCamEnabled: (enabled: boolean) => {
        runtime.actionCamEnabled = enabled
      },
      muzzleFlashTuning: { x: 0, y: 0, z: -72, intensity: 100 },
      setMuzzleFlashTuning: (patch: object) => {
        runtime.muzzleFlashTuning = { ...runtime.muzzleFlashTuning, ...patch }
      },
      previewMuzzleFlash: () => {},
      tunnelEnabled: true,
      setTunnelEnabled: () => {},
      weaponPoseTuning: structuredClone(weaponPoseDefaults),
      weaponPoseDefaults: structuredClone(weaponPoseDefaults),
      weaponPoseTarget: { id: null, name: 'Pistola', rig: null },
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
      rainAmount: 0,
      rainSupported: true,
      setRainAmount(value: number) {
        this.rainAmount = value
      },
      cloudAmount: 0.35,
      cloudPressure: 0.12,
      setCloudWeather: () => {},
      lensFlareAmount: 1,
      setLensFlareAmount: () => {},
      sceneryPhysics: {
        enabled: true,
        setEnabled: (on: boolean) => {
          document.documentElement.dataset.signPhysics = String(on)
        },
        setRadius: (metres: number) => {
          document.documentElement.dataset.signPhysicsRadius = String(metres)
        },
      },
    }
    document.documentElement.dataset.appName = 'EUSKADI.ONLINE'
    document.documentElement.dataset.irunSigns = 'true'
    document.documentElement.dataset.signPhysics = 'true'
    const { setTrafficSignsStorageKey } = await import(
      `${moduleRoot}/src/runtime/traffic-signs-host.ts`
    )
    setTrafficSignsStorageKey('demo-host.signs')
    localStorage.setItem('demo-host.signs', JSON.stringify({ enabled: false }))
    // The HUD persists through runtime.settings (GameRuntime's SettingsStore), as a real runtime does.
    const { SettingsStore } = await import(`${moduleRoot}/src/runtime/settings-scope.ts`)
    Object.assign(runtime, { settings: new SettingsStore({ mode: 'pc', storage: localStorage }) })
    ;(window as never as { __rt: unknown }).__rt = runtime
    mountSettingsHud(runtime as never)
    // Host streaming controls can arrive after the HUD is mounted.
    menuSection('settings-distances', 'Distances')
    const cache = menuSection('terrain-cache', 'Cache')
    check(cache, 'terrain-cache-distance')
    check(cache, 'terrain-cache-memory')
    check(cache, 'terrain-cache-disk')
    const roll = document.getElementById('action-cam-stepRollRadians') as HTMLInputElement
    roll.value = '2'
    roll.dispatchEvent(new Event('input', { bubbles: true }))
    const rollRadians = runtime.actionCamSettings.stepRollRadians
    document.getElementById('action-cam-soft')!.click()
    const softStride = runtime.actionCamSettings.strideMetres
    document.getElementById('action-cam-reset')!.click()
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
    const layers = menuSection('terrain-layers', 'Layers')
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
      rollRadians,
      softStride,
      resetStride: runtime.actionCamSettings.strideMetres,
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
      performance: order('settings-pane-options'),
      video: order('settings-pane-options'),
      options: order('settings-pane-options'),
      dev: order('settings-pane-dev'),
      places: pane('layer-places'),
      placesGroup: document.getElementById('layer-places')?.closest('fieldset')?.id,
      road: pane('layer-road'),
      roadGroup: document.getElementById('layer-road')?.closest('fieldset')?.id,
      groundGroup: document.getElementById('layer-photo')?.closest('fieldset')?.id,
      sourceTitle: document.querySelector('#terrain-source > legend')?.textContent,
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

  const visible = ['Main', 'World', 'Settings', 'Development']
  expect(result.before).toEqual(visible)
  expect(result.actionCam).toBe(false)
  expect(result.rollRadians).toBeCloseTo((2 * Math.PI) / 180, 8)
  expect(result.softStride).toBe(2.8)
  expect(result.resetStride).toBe(2.8)
  expect(result.actionCamPane).toBe('settings-pane-options')
  expect(result.cameraControls).toEqual(['camera-extras', 'settings-action-cam', 'camera-extras'])
  expect(result.smoke).toBe(false)
  expect(result.smokePane).toBe('settings-pane-options')
  expect(result.sidearm).toEqual({ height: -0.055, angle: -0.5 })
  expect(result.preview).toBe(true)
  expect(result.weaponOutputs).toEqual(['-33.00 mm', '0.70°'])
  expect(result.after).toEqual(visible)
  expect(result.planet).toEqual(
    expect.arrayContaining([
      'settings-map',
      'terrain-position',
      'terrain-layers',
      'road-style',
      'settings-planet-sea',
      'settings-planet-air',
      'settings-layer-air',
    ]),
  )
  expect(result.options).toEqual(
    expect.arrayContaining([
      'camera-extras',
      'settings-action-cam',
      'driving-extras',
      'settings-controls',
      'display-quality-section',
      // All shadow controls share Settings > Video > Shadows.
      'quality-shadows',
    ]),
  )
  expect(result.options).toContain('settings-effects')
  expect(result.planet).toContain('terrain-source')
  expect(result.planet).not.toContain('quality-shadows')
  expect(result.options).toContain('settings-muzzle-flash')
  expect(result.options).toEqual(
    expect.arrayContaining([
      'settings-options-sidearm',
      'settings-weapon-poses',
      'settings-muzzle-flash',
    ]),
  )
  expect(result.places).toBe('settings-pane-planet')
  expect(result.placesGroup).toBe('settings-options-labels')
  expect(result.road).toBe('settings-pane-planet')
  expect(result.roadGroup).toBe('road-style')
  expect(result.groundGroup).toBe('terrain-source')
  expect(result.sourceTitle).toBe('Source')
  expect(result.layersTitle).toBe('Buildings')
  expect(result.asphaltTitle).toBe('Infrastructures')
  expect(result.copy).toBeUndefined()
  expect(result.configText).toBeUndefined()
  expect(result.planetHasCopy).toBe(false)
  expect(result.sky).toBe('settings-pane-planet')
  expect(result.clouds).toBe('settings-planet-air')
  expect(result.flare).toBe('settings-layer-celestial')
  expect(result.vehicles).toBe('settings-pane-planet')
  await page.locator('#settings-toggle').click()
  await expect(page.locator('.settings-header strong')).toHaveText('EUSKADI.ONLINE')
  await expect(page.locator('#settings-toggle')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Back to the game' })).toBeVisible()
  await page.getByRole('button', { name: 'Info', exact: true }).click()
  await expect(page.locator('#settings-system-info')).toBeVisible()
  await expect(page.locator('#settings-system-info')).toContainText('Active renderer')
  await expect(page.locator('#settings-system-info')).toContainText('Not reported')
  await expect(page.locator('#settings-system-info')).toContainText('FPS limit (not measured FPS)')
  await page.setViewportSize({ width: 390, height: 740 })
  await expect(page.locator('#settings-system-info')).toBeVisible()
  expect(
    await page.locator('#settings-system-info').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true)
  await page.screenshot({ path: 'tmp/system-info-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 960 })
  const search = page.getByRole('searchbox', { name: 'Search settings' })
  await search.fill('Mouse sensitivity')
  await page
    .locator('#settings-search-results')
    .getByRole('button', { name: /Mouse and gamepad/ })
    .click()
  await page.locator('#input-mouseSensitivity').fill('2')
  await page.locator('#input-invertMouseY').check()
  await page.locator('#input-gamepadDeadzone').fill('0.25')
  expect(await page.evaluate(() => (window as any).__rt.inputPreferences)).toEqual({
    mouseSensitivity: 2,
    invertMouseY: true,
    steeringRiseSeconds: 0.4,
    steeringReleaseSeconds: 0.12,
    gamepadDeadzone: 0.25,
  })
  await expect(page.locator('#settings-distances #terrain-cache-distance')).toHaveCount(1)
  await expect(page.locator('#settings-distances #terrain-cache-memory')).toHaveCount(1)
  await expect(page.locator('#terrain-cache #terrain-cache-disk')).toHaveCount(1)
  await search.fill('View transition')
  await page
    .locator('#settings-search-results')
    .getByRole('button', { name: /Video.*Options/ })
    .click()
  await page.locator('#camera-transition').fill('0')
  await page.locator('#camera-transition').press('Tab')
  await page.locator('#camera-auto-center').uncheck()
  await expect(page.locator('#camera-auto-center-delay')).toBeDisabled()
  await search.fill('Steering response')
  await page
    .locator('#settings-search-results')
    .getByRole('button', { name: /Keyboard steering/ })
    .click()
  await page.locator('#keyboard-rise').fill('0.2')
  await page.locator('#keyboard-rise').press('Tab')
  expect(await page.evaluate(() => (window as any).__rt.inputPreferences.steeringRiseSeconds)).toBe(
    0.2,
  )
  await search.fill('Sun shadow maps')
  await page
    .locator('#settings-search-results')
    .getByRole('button', { name: /Shadows/ })
    .click()
  await expect(page.locator('#sun-shadow-quality')).toHaveValue('profile')
  await expect(page.locator('#sun-shadow-quality option[value="4096"]')).toHaveText(
    '2048 px × 4 cascades',
  )
  await search.fill('Rain')
  await page
    .locator('#settings-search-results')
    .getByRole('button', { name: /Weather/ })
    .click()
  await expect(page.locator('#ps-rain')).toBeEnabled()
  await page.evaluate(() => history.replaceState(null, '', '?rain=0.8&keep=1'))
  await page.locator('#ps-rain').fill('65')
  expect(new URL(page.url()).searchParams.has('rain')).toBe(false)
  expect(new URL(page.url()).searchParams.get('keep')).toBe('1')
  await expect(page.locator('#ps-rain-val')).toHaveText('65%')
  await page.locator('#ps-rain').fill('0')
  await expect(page.locator('#ps-rain-val')).toHaveText('Off')
  expect(await page.evaluate(() => (window as any).__rt.rainAmount)).toBe(0)
  await search.fill('horizon')
  await page.keyboard.press('ArrowDown')
  await expect(
    page
      .locator('#settings-search-results')
      .getByRole('button', { name: /World.*Environment.*Celestial bodies/ }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#ps-moon-horizon-scale')).toBeVisible()
  await search.focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('#settings-window')).toBeVisible()
  await search.fill('no-such-setting-123')
  await expect(page.locator('#settings-search-results').getByRole('status')).toHaveText(
    'No matching settings',
  )
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(search).toHaveValue('')
  await search.fill('shadows')
  await page
    .locator('#settings-search-results')
    .getByRole('button', { name: /Settings.*Video.*Shadows/ })
    .click()
  await expect(page.locator('#settings-video-shadows')).toBeVisible()
  for (const id of [
    'quality-shadows',
    'settings-sign-shadows',
    'settings-experimental-light-shadows',
    'settings-light-shadows',
    'settings-headlamp',
  ]) {
    await expect(page.locator('#settings-video-shadows #' + id)).toBeVisible()
  }
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  const branch = page.locator('#settings-pane-options details[data-nav-group="weapons"]')
  await branch.locator('summary').click()
  const indent = await branch
    .getByRole('button', { name: 'Aiming', exact: true })
    .evaluate((el) => getComputedStyle(el).marginLeft)
  // Nested sections sit indented under their group by the stylesheet's nested-button margin
  // (src/ui/styles/settings.css: 14px since the compact one-stylesheet UI).
  expect(parseFloat(indent)).toBeGreaterThanOrEqual(14)
  await branch.getByRole('button', { name: 'Aiming', exact: true }).click()
  await expect(page.locator('#sidearm-aim-height')).toBeVisible()
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  await expect(page.locator('.settings-footer button')).toHaveCount(0)
  await expect(page.locator('#settings-defaults')).toHaveCount(0)
  // Settings › Video contains Bodycam.
  await page
    .locator('#settings-pane-options .settings-nav-group', {
      has: page.locator('summary', { hasText: /^Video$/ }),
    })
    .evaluate((group) => ((group as HTMLDetailsElement).open = true))
  await page.getByRole('button', { name: 'Quality', exact: true }).click()
  expect(
    await page
      .locator('#display-quality-section input')
      .evaluateAll((els) => els.map((el) => el.id)),
  ).toEqual([
    'display-quality',
    'display-scale',
    'display-scale-auto',
    'anisotropy',
    'display-fsr',
    'display-fsr-sharpness',
  ])
  await page.getByRole('button', { name: 'Bodycam', exact: true }).click()
  await page.locator('#camera-action-cam-settings').getByText('Angles', { exact: true }).click()
  await expect(page.locator('#action-cam-stepRollRadians')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 740 })
  const bodycamHeaders = page.locator('#camera-action-cam-settings > details > summary')
  for (const header of await bodycamHeaders.all()) {
    expect(await header.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(
      36,
    )
    expect(await header.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
  await page.locator('#camera-action-cam-settings').getByText('Angles', { exact: true }).click()
  await page.screenshot({ path: 'tmp/bodycam-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 960 })
  await expect(
    page.locator(
      '#settings-pane-options .settings-sections button[data-section="settings-action-cam"]',
    ),
  ).toHaveCount(1)
  await openNavGroups(page)
  await page.getByRole('button', { name: 'Settings management', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Save all settings as JSON', exact: true }),
  ).toBeVisible()
  // Keys sit in the Settings › Controls group.
  await page
    .locator('#settings-pane-options .settings-nav-group', {
      has: page.locator('summary', { hasText: /^Controls$/ }),
    })
    .evaluate((group) => ((group as HTMLDetailsElement).open = true))
  await page.getByRole('button', { name: 'Keys', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search keys' }).fill('forklift')
  await expect(page.locator('.settings-key-table tbody tr')).toHaveCount(7)
  await expect(page.locator('.settings-key-table')).toContainText('Raise forks')
  await page.getByRole('tab', { name: 'World', exact: true }).click()
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.settings-map-tile')).toHaveCount(2)
  await expect(page.locator('.settings-map-legend')).toContainText('Requested: 1')
  const layout = await page.locator('#settings-window').boundingBox()
  expect(layout?.width).toBe(1440)
  expect(layout?.height).toBe(960)
  const sidebar = await page.locator('#settings-pane-planet .settings-sections').boundingBox()
  const content = await page
    .locator('#settings-pane-planet .settings-section-content')
    .boundingBox()
  expect(sidebar!.x).toBeLessThan(content!.x)
  await page.setViewportSize({ width: 390, height: 740 })
  expect(
    await page.locator('#settings-window').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true)
  const mobileBody = page.locator('#settings-pane-planet .settings-section-content')
  await expect(mobileBody).toBeVisible()
  expect(
    await mobileBody.evaluate((el) => el.previousElementSibling?.getAttribute('data-section')),
  ).toBe('settings-map')
  expect(
    await page.locator('#settings-map').evaluate((el) => getComputedStyle(el, '::before').display),
  ).toBe('none')
  // World > Environment > Atmosphere (the sky layer section).
  await page
    .locator('#settings-pane-planet .settings-nav-group', {
      has: page.locator('summary', { hasText: /^Environment$/ }),
    })
    .evaluate((group) => ((group as HTMLDetailsElement).open = true))
  await page.getByRole('button', { name: 'Atmosphere', exact: true }).click()
  expect(
    await mobileBody.evaluate((el) => el.previousElementSibling?.getAttribute('data-section')),
  ).toBe('settings-layer-air')
  await page.getByRole('button', { name: 'Celestial bodies', exact: true }).click()
  await expect(page.locator('#ps-moon')).toBeVisible()
  await expect(page.locator('#ps-moon-horizon-scale')).toBeVisible()
  await expect(page.locator('#ps-stars')).toBeVisible()
  const row = page.locator('#ps-sun').locator('xpath=ancestor::label')
  const nameBox = await row.locator('.settings-row-name').boundingBox()
  const valueBox = await row.locator('.settings-row-value').boundingBox()
  expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(valueBox!.x)
  expect(
    Math.abs(nameBox!.y + nameBox!.height / 2 - valueBox!.y - valueBox!.height / 2),
  ).toBeLessThan(2)
  await page.screenshot({ path: '/tmp/settings-menu-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 960 })
  await expect
    .poll(() => mobileBody.evaluate((el) => el.parentElement?.id))
    .toBe('settings-pane-planet')
  await expect(page.locator('#ps-sun')).toBeVisible()
  // Traffic signs has its own section under World > Terrain.
  await page.locator('#settings-pane-planet details[data-nav-group="terrain"]').evaluate((el) => {
    ;(el as HTMLDetailsElement).open = true
  })
  await page
    .locator('#settings-pane-planet')
    .getByRole('button', { name: 'Traffic signs', exact: true })
    .click()
  const count = page.getByRole('spinbutton', { name: 'Maximum count value', exact: true })
  await expect(count).toBeEnabled()
  await count.fill('75')
  await count.press('Enter')
  await page
    .getByRole('spinbutton', { name: 'Distance around the player (m) value', exact: true })
    .fill('120')
  await page.getByRole('spinbutton', { name: 'Physics distance (m) value', exact: true }).fill('20')
  await page.getByText('Signage collisions and impacts', { exact: true }).click()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('demo-host.signs')!)),
  ).toMatchObject({ limit: 75, radius: 120, physicsRadius: 20 })
  expect(await page.evaluate(() => document.documentElement.dataset.signPhysicsRadius)).toBe('20')
  // Main › current vehicle (titled with its name) holds the occupied vehicle's sections.
  await page.getByRole('tab', { name: 'Main', exact: true }).click()
  await openNavGroups(page)
  await page.getByRole('button', { name: 'Lights', exact: true }).click()
  await expect(page.locator('#settings-car-beams')).toContainText('Moto de prueba')
  const rearHeight = page.getByRole('slider', {
    name: 'Rear light: up / down (m)',
    exact: true,
  })
  // Settings > Weapons includes the weapon wheel preferences.
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  await page.locator('#settings-pane-options details[data-nav-group="weapons"]').evaluate((el) => {
    ;(el as HTMLDetailsElement).open = true
  })
  await page
    .locator('#settings-pane-options')
    .getByRole('button', { name: 'Weapon wheel', exact: true })
    .click()
  await page.getByRole('button', { name: 'Reset weapon wheel' }).click()
  expect(
    await page.evaluate(
      () => (window as never as { __rt: { weaponWheelResets: number } }).__rt.weaponWheelResets,
    ),
  ).toBe(1)
  // Settings › Camera › field of view.
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  await page.locator('#settings-pane-options details[data-nav-group="video"]').evaluate((el) => {
    ;(el as HTMLDetailsElement).open = true
  })
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  await page.getByRole('slider', { name: 'Field of view (°)' }).fill('6')
  expect(
    await page.evaluate(
      () => (window as never as { __rt: { cameraFovOffset: number } }).__rt.cameraFovOffset,
    ),
  ).toBe(6)
  await page.getByRole('tab', { name: 'Main', exact: true }).click()
  await openNavGroups(page)
  // Sounds: the engine volume follows the mix; a motorcycle has no reversing alarm.
  await page.getByRole('button', { name: 'Sound', exact: true }).click()
  const engineVolume = page.getByRole('slider', { name: 'Engine volume', exact: true })
  await expect(engineVolume).toHaveValue('50')
  await engineVolume.fill('80')
  expect(
    await page.evaluate(
      () => (window as never as { __rt: { audioMix: { engine: number } } }).__rt.audioMix.engine,
    ),
  ).toBeCloseTo(0.8)
  await expect(page.getByRole('checkbox', { name: 'Reversing beeper' })).toBeHidden()
  // The exhaust section only exists for vehicles whose data adjusts it.
  await expect(page.getByRole('button', { name: 'Exhaust and smoke', exact: true })).toBeHidden()
  // A vehicle with a reversing alarm and adjustable exhaust lists both.
  await page.evaluate(() => {
    const rt = (window as never as { __rt: { occupiedVehicle: { options: object } } }).__rt
    rt.occupiedVehicle.options = {
      lamps: { front: false, rear: false },
      mirrors: false,
      exhaust: { position: true, amount: false, follows: 'load' },
      sound: { engine: true, reverseAlarm: true },
    }
  })
  await expect(page.getByRole('checkbox', { name: 'Reversing beeper' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lights', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Exhaust and smoke', exact: true })).toBeVisible()
  await page.evaluate(() => {
    const rt = (window as never as { __rt: { occupiedVehicle: { options: object } } }).__rt
    rt.occupiedVehicle.options = {
      lamps: { front: true, rear: true },
      mirrors: true,
      exhaust: null,
      sound: { engine: true, reverseAlarm: false },
    }
  })
  await page.getByRole('button', { name: 'Lights', exact: true }).click()
  await rearHeight.fill('0.12')
  await page.getByRole('button', { name: 'Share light settings' }).click()
  const shared = page.getByRole('textbox', { name: 'Light settings to share' })
  expect(JSON.parse(await shared.inputValue())).toMatchObject({
    model: '/test-bike.glb',
    values: { rearY: 0.12 },
  })
  // The wheel over the clock button moves the time by one hour per notch (up = later).
  const clock = page.locator('#settings-toggle')
  await expect(clock).toHaveText('12:30')
  await clock.dispatchEvent('wheel', { deltaY: -100 })
  await expect(clock).toHaveText('13:30')
  await clock.dispatchEvent('wheel', { deltaY: 100 })
  await clock.dispatchEvent('wheel', { deltaY: 100 })
  await expect(clock).toHaveText('11:30')
  // The rear light fine tuning is one more section of the current vehicle (Main).
  await page.getByRole('tab', { name: 'Main', exact: true }).click()
  await openNavGroups(page)
  await page.getByRole('button', { name: 'Rear light (fine tuning)', exact: true }).click()
  await page.getByRole('button', { name: 'Back / front (m) +0.01' }).click()
  await page.getByRole('button', { name: 'Back / front (m) +0.05' }).click()
  await page.getByRole('button', { name: 'Copy JSON' }).click()
  const nudged = page.getByRole('textbox', { name: 'Rear light JSON' })
  expect(JSON.parse(await nudged.inputValue()).vehicle.lights.tuning).toMatchObject({
    rearY: 0.12,
    rearZ: 0.06,
  })
  await page.keyboard.press('Escape')
  await expect(page.locator('#settings-window')).toBeHidden()
  await expect(page.locator('#settings-toggle')).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Tab')
  await expect(page.locator('#settings-window')).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.locator('#settings-window')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#settings-window')).toBeHidden()
})
