import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoadingScreen } from '../../game/loading.js'

vi.mock('@nabla/engine/runtime/splash', () => ({
  applySplashSkin: (_screen: unknown, skin: unknown) => skin,
  resolveSplashSkin: (skin: unknown) => skin,
  splashMessageAt: () => '',
}))

afterEach(() => vi.unstubAllGlobals())

function fixture() {
  const elements = new Map(
    ['loading-screen', 'loading-status', 'loading-progress-bar', 'loading-detail'].map((id) => [
      id,
      {
        style: { width: '' },
        textContent: '',
        hidden: false,
        classList: { contains: () => false, add: () => {} },
      },
    ]),
  )
  vi.stubGlobal('document', { getElementById: (id: string) => elements.get(id) })
  const canvas = { dataset: {} as Record<string, string> }
  const events = new EventTarget()
  const loading = new LoadingScreen()
  loading.bindRuntime(canvas as unknown as HTMLCanvasElement, events)
  return { elements, canvas, events, loading }
}

describe('runtime loading screen', () => {
  it('replaces stale terrain counters with worker/GPU work and reveal milestones', () => {
    const { elements, canvas, events, loading } = fixture()
    loading.setTiles([{ z: 15, x: 1, y: 1 }])
    loading.setStatus('0 cells ready')
    loading.setDetail('0 requests')
    canvas.dataset.loadingDetail = 'Uploading GPU textures'
    canvas.dataset.revealProgress = '0.60'
    events.dispatchEvent(new Event('nabla-load-step'))
    expect(elements.get('loading-status')!.textContent).toBe('Uploading GPU textures')
    expect(elements.get('loading-detail')!.textContent).toBe('')
    expect(elements.get('loading-progress-bar')!.style.width).toBe('60%')
    loading.markTileLoaded('WebMercatorQuad/15/1/1')
    expect(elements.get('loading-progress-bar')!.style.width).toBe('60%')
    canvas.dataset.revealProgress = '0.40'
    events.dispatchEvent(new Event('nabla-load-step'))
    expect(elements.get('loading-progress-bar')!.style.width).toBe('60%')
  })

  it('keeps terrain progress until reveal begins and detaches on page disposal', () => {
    const { elements, canvas, events, loading } = fixture()
    loading.setTiles([
      { z: 15, x: 1, y: 1 },
      { z: 15, x: 2, y: 1 },
    ])
    loading.markTileLoaded('WebMercatorQuad/15/1/1')
    expect(elements.get('loading-progress-bar')!.style.width).toBe('50%')
    events.dispatchEvent(new Event('pagehide'))
    canvas.dataset.loadingDetail = 'Late callback'
    events.dispatchEvent(new Event('nabla-load-step'))
    expect(elements.get('loading-status')!.textContent).toBe('')
  })
})
