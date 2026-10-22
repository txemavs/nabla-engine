import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameRuntime } from '@nabla/engine/runtime/browser'

vi.mock('@nabla/engine/xr/ui', () => ({
  bindXRCalibration: () => {
    throw new Error('XR interface mounted')
  },
  bindXRQuality: vi.fn(),
}))
import { bindVR } from '../game/vr-ui.js'
import { pcVRRequested } from '../game/vr-entry.js'

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
  ])('mounts immersive controls for %s %s', async (pathname, search) => {
    vi.stubGlobal('location', { pathname, search })
    const mounted = vi.fn(() => {
      throw new Error('XR interface mounted')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const xr = {
      setHandModel: vi.fn().mockResolvedValue(undefined),
      setActorHands: vi.fn().mockResolvedValue(undefined),
      enableCalibrationScreen: mounted,
    }
    // XR code is loaded on demand: the immersive UI mounts once loadXR resolves.
    const runtime = {
      xr,
      actor: { kind: 'default', color: 'white' },
      loadXR: vi.fn(async () => xr),
    }
    expect(() => bindVR(runtime as unknown as GameRuntime)).not.toThrow()
    await vi.waitFor(() => expect(mounted).toHaveBeenCalled())
    expect(runtime.loadXR).toHaveBeenCalledOnce()
    error.mockRestore()
  })
})

describe('PC VR entry', () => {
  it('recognises only the headset page link', () => {
    expect(pcVRRequested('?vr=pc')).toBe(true)
    expect(pcVRRequested('?vr=pc&quality=high')).toBe(true)
    expect(pcVRRequested('?vr=1')).toBe(false)
    expect(pcVRRequested('')).toBe(false)
  })
  it('opens the desktop game, not the standalone immersive interface', () => {
    vi.stubGlobal('location', { pathname: '/', search: '?vr=pc' })
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
})
