import { test, expect } from '@playwright/test'

test('two real runtimes retain separate preferences, live uniforms and deferred XR state', async ({
  page,
}) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/runtime-settings-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/runtime-settings-check')
  const result = await page.evaluate(
    async (root) => {
      const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
      const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
      const { installSettingsScope } = await import(`/@fs/${root}/src/runtime/settings-scope.ts`)
      const methods = [Storage.prototype.getItem, Storage.prototype.setItem, localStorage.getItem]
      const planet = {
        sky: true,
        sun: true,
        sea: true,
        clouds: true,
        cloudStyle: 'low',
        cloudAmount: 0.35,
        cloudPressure: 0.12,
        lensFlareAmount: 1,
      }
      localStorage.setItem('nabla.planetVisual', JSON.stringify(planet))
      localStorage.setItem('nabla.muzzleFlash', JSON.stringify({ x: 12, intensity: 220 }))
      localStorage.setItem('nabla.cameraFov', '12')
      localStorage.setItem('nabla.smokePercent', '65')
      localStorage.setItem('nabla.actionCam', 'true')
      localStorage.setItem('nabla.bodycam', 'true')
      localStorage.setItem('nabla.actionCamSettings', JSON.stringify({ strideMetres: 2 }))
      localStorage.setItem('nabla.xr.quality.v1', JSON.stringify({ scale: 0.9 }))
      const make = (namespace: string) => {
        const parent = document.createElement('div')
        const canvas = document.createElement('canvas')
        canvas.style.cssText = 'width:320px;height:240px'
        parent.append(canvas)
        document.body.append(parent)
        const floor = createEntity('floor', 'box', [0, -0.5, 0])
        floor.size = [20, 1, 20]
        return new GameRuntime({
          canvas,
          clock: 'manual',
          sea: false,
          audio: false,
          settings: { mode: 'pc', namespace },
          scene: {
            version: 1,
            name: namespace,
            geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
            entities: [floor, createEntity('spawn', 'spawn', [0, 1, 0])],
          },
        })
      }
      const a = make('left'),
        b = make('right')
      let c: any
      try {
        const initial = [a.cameraFovOffset, b.cameraFovOffset, a.smokePercent, b.smokePercent]
        const initialCamera = [
          a.actionCamEnabled,
          b.actionCamEnabled,
          a.bodycamEnabled,
          b.bodycamEnabled,
          a.actionCamSettings.strideMetres,
          b.actionCamSettings.strideMetres,
        ]
        a.setActionCamEnabled(false)
        a.setBodycamEnabled(false)
        a.setActionCamSettings({ strideMetres: 3 })
        const initialFlash = [a.muzzleFlashTuning, b.muzzleFlashTuning]
        a.setMuzzleFlashTuning({ intensity: 40 })
        a.setSidearmTuning({ angle: 3 })
        a.setDisplay({ resolutionScale: 0.75, maxFps: 60 })
        const displayBeforePlay = [a.displaySettings, b.displaySettings]
        a.setPlanetLayers({ sky: false, sun: false, clouds: false })
        a.setCloudStyle('artistic')
        a.setCloudWeather(0.2, 0.7)
        a.setLensFlareAmount(0.3)
        a.setCameraFovOffset(25)
        a.setSmokePercent(20)
        a.setHiddenLayers(['road'])
        a.setAsphaltContrast(2)
        a.setAnisotropy(1)
        a.setVehicleBeamCutoff('low', 3)
        b.setSmokePercent(80)
        b.setHiddenLayers(['buildings'])
        b.setAsphaltContrast(0.5)
        b.setVehicleBeamCutoff('low', -2)
        a.settings.setItem('nabla.xr.quality.v1', JSON.stringify({ scale: 1.2 }))
        installSettingsScope('headset')
        // Both XR objects are loaded AFTER the page default changes.
        const axr = await a.loadXR(),
          bxr = await b.loadXR()
        const beforeDispose = {
          fov: [a.cameraFovOffset, b.cameraFovOffset],
          smoke: [a.smokePercent, b.smokePercent],
          layers: [a.hiddenLayers, b.hiddenLayers],
          asphalt: [a.asphaltContrast, b.asphaltContrast],
          beams: [a.getVehicleBeamCutoff('low'), b.getVehicleBeamCutoff('low')],
          xr: [axr.quality.scale, bxr.quality.scale],
          modes: [a.settings.mode, b.settings.mode],
          uniforms: [
            (a as any).effects.smoke.root.material.uniforms.smokeDensity.value,
            (b as any).effects.smoke.root.material.uniforms.smokeDensity.value,
          ],
        }
        await a.play({ playerMode: 'walk', physicsWorker: false })
        await b.play({ playerMode: 'walk', physicsWorker: false })
        a.tick(performance.now())
        b.tick(performance.now())
        const { startVREntry } = await import(`/@fs/${root}/game/vr-entry.ts`)
        let gestureMode = ''
        await startVREntry({
          settings: a.settings,
          loadedXR: {
            enter: () => {
              gestureMode = a.settings.mode
              return Promise.resolve()
            },
          },
        })
        const entryModes = [gestureMode, a.settings.mode, b.settings.mode]
        a.dispose()
        b.setCameraFovOffset(7)
        b.tick(performance.now() + 32)
        c = make('left')
        return {
          initial,
          initialFlash,
          restoredFlash: c.muzzleFlashTuning,
          survivorFlash: b.muzzleFlashTuning,
          displayBeforePlay,
          planetPreferences: [b.planetVisualConfig(), c.planetVisualConfig()],
          savedPlanet: JSON.parse(localStorage.getItem('nabla.planetVisual')!),
          initialCamera,
          cameraPreferences: [
            b.actionCamEnabled,
            b.bodycamEnabled,
            b.actionCamSettings.strideMetres,
            c.actionCamEnabled,
            c.bodycamEnabled,
            c.actionCamSettings.strideMetres,
          ],
          beforeDispose,
          entryModes,
          survivor: [b.cameraFovOffset, b.smokePercent, b.asphaltContrast],
          restored: [c.cameraFovOffset, c.smokePercent],
          legacy: [
            localStorage.getItem('nabla.cameraFov'),
            localStorage.getItem('nabla.smokePercent'),
          ],
          unpatched:
            methods[0] === Storage.prototype.getItem &&
            methods[1] === Storage.prototype.setItem &&
            methods[2] === localStorage.getItem,
        }
      } finally {
        a.dispose()
        b.dispose()
        c?.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result.initial).toEqual([12, 12, 65, 65])
  expect(result.beforeDispose).toEqual({
    fov: [25, 12],
    smoke: [20, 80],
    layers: [['road'], ['buildings']],
    asphalt: [2, 0.5],
    beams: [3, -2],
    xr: [1.2, 0.9],
    modes: ['pc', 'pc'],
    uniforms: [0.2, 0.8],
  })
  expect(result.planetPreferences).toEqual([
    {
      sky: true,
      sun: true,
      clouds: true,
      sea: false,
      cloudStyle: 'low',
      cloudAmount: 0.35,
      cloudPressure: 0.12,
      lensFlare: 1,
    },
    {
      sky: false,
      sun: false,
      clouds: false,
      sea: false,
      cloudStyle: 'artistic',
      cloudAmount: 0.2,
      cloudPressure: 0.7,
      lensFlare: 0.3,
    },
  ])
  expect(result.savedPlanet).toMatchObject({
    sky: true,
    sea: true,
    cloudAmount: 0.35,
    lensFlareAmount: 1,
  })
  expect(result.displayBeforePlay).toEqual([
    { maxFps: 60, resolutionScale: 0.75, resolutionScaleMode: 'manual' },
    { maxFps: 0, resolutionScale: 1, resolutionScaleMode: 'manual' },
  ])
  expect(result.initialFlash).toEqual([
    { x: 12, y: 0, z: -72, intensity: 220 },
    { x: 12, y: 0, z: -72, intensity: 220 },
  ])
  expect(result.restoredFlash).toEqual({ x: 12, y: 0, z: -72, intensity: 40 })
  expect(result.survivorFlash).toEqual({ x: 12, y: 0, z: -72, intensity: 220 })
  expect(result.initialCamera).toEqual([true, true, true, true, 2, 2])
  expect(result.cameraPreferences).toEqual([true, true, 2, false, false, 3])
  expect(result.entryModes).toEqual(['pc', 'headset-pc', 'pc'])
  expect(result.survivor).toEqual([7, 80, 0.5])
  expect(result.restored).toEqual([25, 20])
  expect(result.legacy).toEqual(['12', '65'])
  expect(result.unpatched).toBe(true)
  expect(errors).toEqual([])
})
