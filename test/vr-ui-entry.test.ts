import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameRuntime } from '@nabla/engine/runtime/browser'

vi.mock('@nabla/engine/xr/ui', () => ({
  bindXRCalibration: () => {
    throw new Error('XR interface mounted')
  },
  bindXRQuality: vi.fn(),
}))
import { bindVR } from '../game/vr-ui.js'

afterEach(() => vi.unstubAllGlobals())
describe('desktop and immersive interface separation', () => {
  it.each(['/', '/index.html', '/test.html'])('keeps %s free of XR controls', (pathname) => {
    vi.stubGlobal('location', { pathname, search: '?quality=minimal' })
    const runtime = new Proxy(
      {},
      {
        get() {
          throw new Error('Desktop touched XR runtime')
        },
      },
    )
    expect(() => bindVR(runtime as GameRuntime)).not.toThrow()
  })
  it.each([
    ['/xr.html', ''],
    ['/xr-demo.html', ''],
    ['/test.html', '?xr=1'],
  ])('mounts immersive controls for %s %s', (pathname, search) => {
    vi.stubGlobal('location', { pathname, search })
    const runtime = {
      xr: {
        setHandModel: vi.fn().mockResolvedValue(undefined),
        enableCalibrationScreen: () => {
          throw new Error('XR interface mounted')
        },
      },
    }
    expect(() => bindVR(runtime as unknown as GameRuntime)).toThrow('XR interface mounted')
  })
})
