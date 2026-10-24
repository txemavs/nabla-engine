import { expect, it } from 'vitest'
import { systemInfoRows } from '../../game/system-info.js'

it('reports runtime facts instead of confusing browser capabilities with the active renderer', () => {
  const runtime = {
    backend: 'webgl',
    physicsThread: 'worker',
    settings: { mode: 'headset-pc' },
    session: { state: 'playing' },
    visibility: { preset: 'high' },
    streaming: { distance: 4000, cells: 25 },
    cellStats: { loaded: 5, visible: 3, pending: 2, missing: 1, failed: 0 },
    displaySettings: { maxFps: 60 },
    resolutionScaleState: { scale: 0.75, mode: 'auto' },
    fsrSettings: { mode: 'quality', sharpness: 0.4 },
  }
  const doc = {
    defaultView: {
      innerWidth: 800,
      innerHeight: 600,
      devicePixelRatio: 2,
      isSecureContext: true,
      crossOriginIsolated: true,
      navigator: {
        hardwareConcurrency: 8,
        deviceMemory: 4,
        userAgent: 'Test browser',
        onLine: false,
        gpu: {},
        getGamepads: () => {
          throw Error('blocked')
        },
      },
    },
    getElementById: () => ({ width: 1200, height: 900 }),
  }
  const rows = new Map(systemInfoRows(runtime as never, doc as never))
  expect(rows.get('Active renderer')).toBe('WebGL')
  expect(rows.get('Canvas drawing buffer')).toBe('1200 × 900 px')
  expect(rows.get('Render scale')).toBe('75% · auto')
  expect(rows.get('FPS limit (not measured FPS)')).toBe('60')
  expect(rows.get('Device memory estimate')).toBe('≈ 4 GiB')
  expect(rows.get('Detected gamepads')).toBe('Not reported')
  expect(rows.get('Browser online flag')).toBe('No')
  runtime.resolutionScaleState.scale = 1
  expect(new Map(systemInfoRows(runtime as never, doc as never)).get('Render scale')).toBe(
    '100% · auto',
  )
})
