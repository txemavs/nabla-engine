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
    const { UsbControllers } = await import(`/@fs/${root}/src/runtime/usb/controllers.ts`)
    const { menuSection } = await import(`/@fs/${root}/game/menu.ts`)
    const { mountSettingsHud } = await import(`/@fs/${root}/game/settings-hud.ts`)
    const { normalizeActionCamSettings } = await import(
      `/@fs/${root}/src/runtime/action-cam-settings.ts`
    )
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
    check(menuSection('terrain-source', 'Terrain'), 'source')
    check(menuSection('terrain-position', 'Position'), 'position')
    check(menuSection('camera-extras', 'Camera'), 'flip')
    check(menuSection('driving-extras', 'Driving'), 'recover-to-road')
    check(menuSection('road-style', 'Asfalto'), 'asphalt')
    check(menuSection('quality-shadows', 'Sombras'), 'shadows')
    check(menuSection('scene-vehicles', 'Vehicles'), 'vehicles')
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
    localStorage.setItem('euskadi.irun-signs', JSON.stringify({ enabled: false }))
    ;(window as never as { __rt: unknown }).__rt = runtime
    mountSettingsHud(runtime as never)
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
  expect(result.cameraControls).toEqual(['camera-extras', 'camera-extras', 'camera-extras'])
  expect(result.smoke).toBe(false)
  expect(result.smokePane).toBe('settings-pane-planet')
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
      // Rendering quality lives in Settings › Simulation; the effects switches in World › View › Options.
      'quality-shadows',
    ]),
  )
  expect(result.planet).toEqual(expect.arrayContaining(['settings-effects', 'terrain-source']))
  expect(result.planet).not.toContain('quality-shadows')
  expect(result.options).not.toContain('settings-muzzle-flash')
  expect(result.dev).toEqual(
    expect.arrayContaining([
      'settings-config-planet',
      'settings-options-sidearm',
      'settings-weapon-poses',
      'settings-muzzle-flash',
    ]),
  )
  expect(result.places).toBe('settings-pane-planet')
  expect(result.placesGroup).toBe('terrain-layers')
  expect(result.road).toBe('settings-pane-planet')
  expect(result.layersTitle).toBe('Land')
  expect(result.asphaltTitle).toBe('Asphalt contrast')
  expect(result.copy).toBe('settings-pane-dev')
  expect(result.configText).toContain('cloudAmount=0.35')
  expect(result.planetHasCopy).toBe(false)
  expect(result.sky).toBe('settings-pane-planet')
  expect(result.clouds).toBe('settings-layer-air')
  expect(result.flare).toBe('settings-lens-flare')
  expect(result.vehicles).toBe('settings-pane-planet')
  await page.locator('#settings-toggle').click()
  await expect(page.locator('.settings-header strong')).toHaveText('EUSKADI.ONLINE')
  await expect(page.locator('#settings-toggle')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Back to the game' })).toBeVisible()
  await page.getByRole('tab', { name: 'Development' }).click()
  const branch = page.locator('#settings-pane-dev .settings-nav-group')
  await expect(branch).toHaveAttribute('open', '')
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
  // Settings › Camera is a group: open it to reach its Action Cam section.
  await page
    .locator('#settings-pane-options .settings-nav-group', {
      has: page.locator('summary', { hasText: /^Camera$/ }),
    })
    .evaluate((group) => ((group as HTMLDetailsElement).open = true))
  await page.getByRole('button', { name: 'Action Cam', exact: true }).click()
  await page.locator('#camera-action-cam-settings').getByText('Angles', { exact: true }).click()
  await expect(page.locator('#action-cam-stepRollRadians')).toBeVisible()
  await expect(
    page.locator(
      '#settings-pane-options .settings-sections button[data-section="settings-action-cam"]',
    ),
  ).toHaveCount(1)
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
  // World › View › Atmosphere (the sky layer section).
  await page
    .locator('#settings-pane-planet .settings-nav-group', {
      has: page.locator('summary', { hasText: /^View$/ }),
    })
    .evaluate((group) => ((group as HTMLDetailsElement).open = true))
  await page.getByRole('button', { name: 'Atmosphere', exact: true }).click()
  expect(
    await mobileBody.evaluate((el) => el.previousElementSibling?.getAttribute('data-section')),
  ).toBe('settings-layer-air')
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
  // Traffic signs is a member of the flat World › View › Options section.
  await page
    .locator('#settings-pane-planet')
    .getByRole('button', { name: 'Options', exact: true })
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
    await page.evaluate(() => JSON.parse(localStorage.getItem('euskadi.irun-signs')!)),
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
  // World › Weapons resets the weapon wheel.
  await page.getByRole('tab', { name: 'World', exact: true }).click()
  await openNavGroups(page)
  // With no combat section on this page the Weapons group is a single button.
  await page
    .locator('#settings-pane-planet')
    .getByRole('button', { name: 'Weapons', exact: true })
    .click()
  await page.getByRole('button', { name: 'Reset weapon wheel' }).click()
  expect(
    await page.evaluate(
      () => (window as never as { __rt: { weaponWheelResets: number } }).__rt.weaponWheelResets,
    ),
  ).toBe(1)
  // Settings › Camera › field of view.
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  await openNavGroups(page)
  await page.getByRole('button', { name: 'Field of view', exact: true }).click()
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
  await expect(page.locator('#settings-window')).toBeHidden()
})
