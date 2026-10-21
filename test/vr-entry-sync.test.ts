import { afterEach, describe, expect, it, vi } from 'vitest'
import { XRSessionController } from '../src/runtime/xr-session.js'
import { startVREntry } from '../game/vr-entry.js'

afterEach(() => vi.unstubAllGlobals())

describe('casco button', () => {
  it('calls navigator.xr.requestSession synchronously in the click handler', () => {
    vi.stubGlobal('location', {
      pathname: '/',
      search: '?vr=headset',
      href: 'https://x/?vr=headset',
    })
    // Never resolves, like Quest Link before the headset is worn: only the synchronous call counts.
    const requestSession = vi.fn(() => new Promise<XRSession>(() => {}))
    const system = { requestSession } as unknown as XRSystem
    vi.stubGlobal('navigator', { xr: system })
    const controller = new XRSessionController(
      { setSession: async () => {}, setReferenceSpace: () => {} },
      () => {},
      () => {},
    )
    const loadXR = vi.fn()
    const runtime = {
      loadedXR: { enter: () => controller.enter(system) },
      loadXR,
    } as unknown as Parameters<typeof startVREntry>[0]

    void startVREntry(runtime)

    expect(requestSession).toHaveBeenCalledOnce()
    expect(requestSession).toHaveBeenCalledWith('immersive-vr', {
      requiredFeatures: ['local-floor'],
    })
    expect(loadXR).not.toHaveBeenCalled()
  })
})
