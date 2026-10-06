/** Demo-owned display controls; Engine owns validation, frame pacing and buffer resizing. */
import { resolveDisplaySettings, type DisplaySettings } from '@nabla/engine/config/display'
import type { GameRuntime } from '@nabla/engine/runtime/browser'

/**
 * Read shareable URL overrides, falling back to Engine defaults for invalid input.
 * The player's saved `scale` wins: `scale=<0.25..1>` fixes it, `scale=auto` adapts live.
 * Without `scale` the quality preset's fixed step decides (`presetResolutionScales`).
 */
export function readDisplaySettings(search = location.search): DisplaySettings {
  const params = new URLSearchParams(search)
  const scale = params.get('scale')
  const preset = params.get('quality') ?? 'custom'
  try {
    return resolveDisplaySettings(
      {
        maxFps: Number(params.get('fps') ?? 0),
        ...(scale === 'auto'
          ? { resolutionScaleMode: 'auto' as const }
          : scale !== null
            ? { resolutionScale: Number(scale), resolutionScaleMode: 'manual' as const }
            : {}),
      },
      preset,
    )
  } catch {
    return resolveDisplaySettings({}, preset)
  }
}

/** True when the player chose auto resolution (`scale=auto`); the boot probe then picks the start. */
export function wantsAutoResolution(search = location.search): boolean {
  return new URLSearchParams(search).get('scale') === 'auto'
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
  // Taking focus from the canvas is enough: the runtime frees the pointer when it loses input.
  const releaseFocus = () => document.getElementById('game-canvas')?.blur()
  panel.addEventListener('toggle', () => {
    if (panel.open) {
      releaseFocus()
      sync()
    } else document.getElementById('game-canvas')?.focus()
  })
  // Only a scale the player picked is saved; otherwise a later quality change keeps its default.
  let scaleChosen = new URLSearchParams(location.search).has('scale')
  const persist = () => {
    const url = new URL(location.href)
    const state = runtime.resolutionScaleState
    url.searchParams.set('fps', String(runtime.displaySettings.maxFps))
    if (scaleChosen)
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
    scaleChosen = true
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
    scaleChosen = true
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
