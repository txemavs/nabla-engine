import { expect, it } from 'vitest'
import { inspectXRDevice, xrDeviceHint } from '../../src/runtime/xr-device-info.js'

it('does not classify a Quest as a phone just because its browser reports Android', () => {
  expect(xrDeviceHint('Android Mobile OculusBrowser Quest 3', true)).toContain('Casco Meta Quest')
  expect(xrDeviceHint('Android Mobile Chrome', true)).toContain('Móvil/tablet Android')
  expect(xrDeviceHint('Desktop Chrome')).toContain('no confirmado')
})
it('separates XR sources from ordinary gamepads without guessing their connection', () => {
  const pad = {
    id: 'Wireless Controller',
    connected: true,
    mapping: 'standard',
    buttons: [0, 0],
    axes: [0, 0, 0, 0],
  }
  const report = inspectXRDevice(
    {
      userAgent: 'Android',
      getGamepads: () => [null, pad, { ...pad, mapping: 'xr-standard' }],
    } as any,
    {
      environmentBlendMode: 'alpha-blend',
      interactionMode: 'screen-space',
      visibilityState: 'visible',
      enabledFeatures: ['local-floor'],
      inputSources: [
        { handedness: 'none', targetRayMode: 'screen', profiles: ['generic-touchscreen'] },
      ],
    } as any,
  )
  expect(report.gamepads).toEqual([
    { name: 'Wireless Controller', mapping: 'standard', buttons: 2, axes: 4 },
  ])
  expect(report.inputs[0]).toMatchObject({ ray: 'screen', handTracking: false, buttons: 0 })
  expect(report.features).toEqual(['local-floor'])
})
it('reports denied gamepad access without failing the AR launcher', () => {
  const report = inspectXRDevice({
    userAgent: '',
    getGamepads() {
      throw new Error('SecurityError')
    },
  })
  expect(report.gamepadAccess).toBe(false)
  expect(report.session).toBe('Sin sesión XR activa')
  expect(report.inputs).toEqual([])
})
