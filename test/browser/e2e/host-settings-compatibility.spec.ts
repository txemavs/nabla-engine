import { test, expect } from '@playwright/test'

for (const [mode, query, prefix, fov, quality] of [
  ['pc', '', 'nabla.', 11, 'high'],
  ['headset', '?vr=headset', 'nabla.settings.headset.', 22, 'low'],
  ['headset-pc', '?vr=pc', 'nabla.settings.headset-pc.', 23, 'balanced'],
] as const) {
  test(`host boot and runtime controls retain legacy ${mode} preferences`, async ({ page }) => {
    await page.route('**/host-settings-check*', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
    )
    await page.goto('/host-settings-check' + query)
    const result = await page.evaluate(
      async ({ root, prefix, fov }) => {
        const native = [Storage.prototype.getItem, Storage.prototype.setItem, localStorage.getItem]
        const saved: Record<string, string> = {
          'nabla.cameraFov': '11',
          'nabla.quality': 'high',
          'nabla.settings.headset.cameraFov': '22',
          'nabla.settings.headset.quality': 'low',
          'nabla.settings.headset-pc.cameraFov': '23',
          'nabla.settings.headset-pc.quality': 'balanced',
          'demo-host.signs': JSON.stringify({ enabled: false, radius: 140 }),
          token: 'unrelated',
        }
        saved[prefix + 'modeSeeded'] = '1'
        saved[prefix + 'smokePercent'] = '60'
        saved[prefix + 'xr.quality.v1'] = JSON.stringify({ scale: 1.1 })
        for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value)
        ;(window as any).NABLA_SETTINGS_DEFAULTS = { headset: { 'nabla.quality': 'minimal' } }
        await import(`/@fs/${root}/game/settings-scope-boot.ts`)
        const { browserStorage } = await import(`/@fs/${root}/game/entry.ts`)
        const { readQualityPreset } = await import(`/@fs/${root}/dist/runtime/quality-preset.js`)
        const { GameRuntime } = await import(`/@fs/${root}/dist/runtime/browser.js`)
        const { createEntity } = await import(`/@fs/${root}/dist/entity/schema.js`)
        const canvas = document.createElement('canvas')
        canvas.style.cssText = 'width:320px;height:240px'
        document.body.append(canvas)
        const runtime = new GameRuntime({
          canvas,
          audio: false,
          sea: false,
          clock: 'manual',
          scene: {
            version: 1,
            name: 'host',
            geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
            entities: [createEntity('spawn', 'spawn')],
          },
        })
        try {
          const boot = [browserStorage().getItem('nabla.cameraFov'), readQualityPreset()]
          const current = [runtime.settings.mode, runtime.cameraFovOffset, runtime.smokePercent]
          const xr = await runtime.loadXR()
          const scale = xr.quality.scale
          const untouched = Object.entries(saved).every(
            ([key, value]) => localStorage.getItem(key) === value,
          )
          runtime.setCameraFovOffset(fov + 1)
          const physical = localStorage.getItem(prefix + 'cameraFov')
          const othersUntouched = Object.entries(saved)
            .filter(([key]) => key !== prefix + 'cameraFov')
            .every(([key, value]) => localStorage.getItem(key) === value)
          return {
            boot,
            current,
            scale,
            untouched,
            physical,
            othersUntouched,
            native:
              native[0] === Storage.prototype.getItem &&
              native[1] === Storage.prototype.setItem &&
              native[2] === localStorage.getItem,
          }
        } finally {
          runtime.dispose()
        }
      },
      { root: process.cwd().replaceAll('\\', '/'), mode, prefix, fov, quality },
    )
    expect(result).toEqual({
      boot: [String(fov), quality],
      current: [mode, fov, 60],
      scale: 1.1,
      untouched: true,
      physical: String(fov + 1),
      othersUntouched: true,
      native: true,
    })
  })
}
