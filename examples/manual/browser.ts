/** Integrate in a browser bundler; the host owns canvas layout and unmount. */
import { BrowserGameRuntime } from '@nabla/engine/runtime/browser'
import { createManualScene } from './scene.mjs'

export async function mountManualGame(canvas: HTMLCanvasElement): Promise<() => void> {
  const runtime = new BrowserGameRuntime({
    canvas,
    scene: createManualScene(),
    hud: true,
    audio: false,
    sea: false,
    locale: 'en',
    onError: (error) => console.error('Manual game error:', error),
  })
  try {
    await runtime.play({ vehicleId: 'manual-car' })
  } catch (error) {
    runtime.dispose()
    throw error
  }
  return () => runtime.dispose()
}
