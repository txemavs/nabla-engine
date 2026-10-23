import { applyI18nAttributes, t } from '@nabla/engine/i18n'
import { pageSearch } from './page-query.js'
/** Demo-owned display controls; Engine owns validation, frame pacing and buffer resizing. */
import { resolveDisplaySettings, type DisplaySettings } from '@nabla/engine/config/display'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { readQualityPreset, saveQualityPreset } from '@nabla/engine/runtime/quality-preset'

/**
 * Read shareable URL overrides, falling back to Engine defaults for invalid input.
 * The player's saved `scale` wins: `scale=<0.25..5>` fixes it (above 1 supersamples), `scale=auto` adapts live.
 * Without `scale` the quality preset's fixed step decides (`presetResolutionScales`).
 */
export function readDisplaySettings(search = pageSearch()): DisplaySettings {
  const params = new URLSearchParams(search)
  const scale = params.get('scale')
  const preset = readQualityPreset(search)
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
export function wantsAutoResolution(search = pageSearch()): boolean {
  return new URLSearchParams(search).get('scale') === 'auto'
}

function scaleLabel(runtime: GameRuntime): string {
  const { mode, scale } = runtime.resolutionScaleState
  const percent = Math.round(scale * 100)
  return t(mode === 'auto' ? 'settings.scale-auto-of-profile' : 'settings.scale-of-profile', {
    percent,
  })
}

/** Bind host controls; FPS/scale apply live, while a quality-profile change explicitly reloads. */
export function bindDisplaySettings(runtime: GameRuntime): void {
  applyI18nAttributes(document.getElementById('display-settings') ?? undefined)
  const panel = document.getElementById('display-settings') as HTMLDetailsElement
  const fps = document.getElementById('display-fps') as HTMLInputElement
  const scale = document.getElementById('display-scale') as HTMLInputElement
  const auto = document.getElementById('display-scale-auto') as HTMLInputElement | null
  const label = document.getElementById('display-scale-label')!
  const quality = document.getElementById('display-quality') as HTMLSelectElement
  const steps = [0.5, 1, 1.5, 2]
  scale.min = '0'
  scale.max = String(steps.length - 1)
  scale.step = '1'
  const initial = runtime.displaySettings
  fps.value = String(initial.maxFps)
  const sync = () => {
    const state = runtime.resolutionScaleState
    scale.value = String(
      steps.reduce(
        (best, value, i) =>
          Math.abs(value - state.scale) < Math.abs(steps[best] - state.scale) ? i : best,
        0,
      ),
    )
    if (auto) auto.checked = state.mode === 'auto'
    scale.disabled = state.mode === 'auto'
    label.textContent = scaleLabel(runtime)
  }
  sync()
  // Auto mode moves the scale live; keep the slider and label honest.
  document.getElementById('game-canvas')?.addEventListener('nabla:resolution-scale', () => sync())
  quality.value = readQualityPreset(pageSearch(), runtime.settings)
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
  let scaleChosen = new URLSearchParams(pageSearch()).has('scale')
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
      fps.setCustomValidity(t('settings.fps-invalid'))
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
      resolutionScale: steps[Number(scale.value)],
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
    // Saved, not only put in the URL: hosts that strip the query (Euskadi) would lose it.
    saveQualityPreset(quality.value, runtime.settings)
    const url = new URL(location.href)
    url.searchParams.set('quality', quality.value)
    location.assign(url.href)
  })
}
