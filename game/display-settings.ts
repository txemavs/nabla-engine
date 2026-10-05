/** Demo-owned display controls; Engine owns validation, frame pacing and buffer resizing. */
import { resolveDisplaySettings, type DisplaySettings } from '@nabla/engine/config/display'
import type { GameRuntime } from '@nabla/engine/runtime/browser'

/**
 * Read shareable URL overrides, falling back to Engine defaults for invalid input.
 * `scale=<0.25..1>` fixes the resolution (manual); `scale=auto` or no `scale` keeps auto mode.
 */
export function readDisplaySettings(search = location.search): DisplaySettings {
  const params = new URLSearchParams(search)
  const scale = params.get('scale')
  try {
    return resolveDisplaySettings({
      maxFps: Number(params.get('fps') ?? 0),
      ...(scale !== null && scale !== 'auto'
        ? { resolutionScale: Number(scale), resolutionScaleMode: 'manual' as const }
        : { resolutionScaleMode: 'auto' as const }),
    })
  } catch {
    return resolveDisplaySettings()
  }
}

/** True when the URL leaves resolution to auto mode (the boot probe may pick the start scale). */
export function wantsAutoResolution(search = location.search): boolean {
  const scale = new URLSearchParams(search).get('scale')
  return scale === null || scale === 'auto'
}

function scaleLabel(runtime: GameRuntime): string {
  const { mode, scale } = runtime.resolutionScaleState
  const percent = Math.round(scale * 100)
  return mode === 'auto' ? `Auto · ${percent}% del perfil` : `${percent}% del perfil`
}

/** Bind host controls; FPS/scale apply live, while a quality-profile change explicitly reloads. */
export function bindDisplaySettings(runtime: GameRuntime): void {
  const panel = document.getElementById('display-settings') as HTMLDetailsElement
  const fps = document.getElementById('display-fps') as HTMLInputElement
  const scale = document.getElementById('display-scale') as HTMLInputElement
  const auto = document.getElementById('display-scale-auto') as HTMLInputElement | null
  const label = document.getElementById('display-scale-label')!
  const quality = document.getElementById('display-quality') as HTMLSelectElement
  const initial = runtime.displaySettings
  fps.value = String(initial.maxFps)
  const sync = () => {
    const state = runtime.resolutionScaleState
    scale.value = String(Math.round(state.scale * 100))
    if (auto) auto.checked = state.mode === 'auto'
    scale.disabled = state.mode === 'auto'
    label.textContent = scaleLabel(runtime)
  }
  sync()
  // Auto mode moves the scale live; keep the slider and label honest.
  document.getElementById('game-canvas')?.addEventListener('nabla:resolution-scale', () => sync())
  quality.value = new URLSearchParams(location.search).get('quality') ?? 'custom'
  if (!quality.value) quality.value = 'custom'
  const releaseFocus = () => {
    document.exitPointerLock?.()
    document.getElementById('game-canvas')?.blur()
  }
  panel.addEventListener('toggle', () => {
    if (panel.open) {
      releaseFocus()
      sync()
    } else document.getElementById('game-canvas')?.focus()
  })
  const persist = () => {
    const url = new URL(location.href)
    const state = runtime.resolutionScaleState
    url.searchParams.set('fps', String(runtime.displaySettings.maxFps))
    url.searchParams.set('scale', state.mode === 'auto' ? 'auto' : String(state.scale))
    history.replaceState(null, '', url)
  }
  const applyFps = () => {
    if (!fps.checkValidity()) return
    const maxFps = Number(fps.value)
    if (maxFps !== 0 && maxFps < 30) {
      fps.setCustomValidity('Usa 0 o un valor entre 30 y 360.')
      fps.reportValidity()
      return
    }
    runtime.setDisplay({ maxFps })
    persist()
  }
  const applyScale = () => {
    if (!scale.checkValidity()) return
    runtime.setDisplay({
      resolutionScale: Number(scale.value) / 100,
      resolutionScaleMode: 'manual',
    })
    sync()
    persist()
  }
  fps.addEventListener('input', () => fps.setCustomValidity(''))
  fps.addEventListener('change', applyFps)
  scale.addEventListener('change', applyScale)
  auto?.addEventListener('change', () => {
    if (auto.checked) runtime.setDisplay({ resolutionScaleMode: 'auto' })
    else
      runtime.setDisplay({
        resolutionScale: runtime.resolutionScaleState.scale,
        resolutionScaleMode: 'manual',
      })
    sync()
    persist()
  })
  document.getElementById('display-apply-quality')!.addEventListener('click', () => {
    const url = new URL(location.href)
    url.searchParams.set('quality', quality.value)
    location.assign(url.href)
  })
}
