/** Demo-owned display controls; Engine owns validation, frame pacing and buffer resizing. */
import { resolveDisplaySettings, type DisplaySettings } from '@nabla/engine/config/display'
import type { GameRuntime } from '@nabla/engine/runtime/browser'

/** Read shareable URL overrides, falling back to Engine defaults for invalid input. */
export function readDisplaySettings(search = location.search): DisplaySettings {
  const params = new URLSearchParams(search)
  try {
    return resolveDisplaySettings({
      maxFps: Number(params.get('fps') ?? 0),
      resolutionScale: Number(params.get('scale') ?? 1),
    })
  } catch {
    return resolveDisplaySettings()
  }
}

/** Bind host controls; FPS/scale apply live, while a quality-profile change explicitly reloads. */
export function bindDisplaySettings(runtime: GameRuntime): void {
  const panel = document.getElementById('display-settings') as HTMLDetailsElement
  const fps = document.getElementById('display-fps') as HTMLInputElement
  const scale = document.getElementById('display-scale') as HTMLInputElement
  const label = document.getElementById('display-scale-label')!
  const quality = document.getElementById('display-quality') as HTMLSelectElement
  const initial = runtime.displaySettings
  fps.value = String(initial.maxFps)
  scale.value = String(initial.resolutionScale * 100)
  label.textContent = `${scale.value}% del perfil`
  quality.value = new URLSearchParams(location.search).get('quality') ?? 'custom'
  if (!quality.value) quality.value = 'custom'
  const releaseFocus = () => {
    document.exitPointerLock?.()
    document.getElementById('game-canvas')?.blur()
  }
  panel.addEventListener('toggle', () => {
    if (panel.open) releaseFocus()
    else document.getElementById('game-canvas')?.focus()
  })
  const apply = () => {
    if (!fps.checkValidity() || !scale.checkValidity()) return
    const maxFps = Number(fps.value)
    if (maxFps !== 0 && maxFps < 30) {
      fps.setCustomValidity('Usa 0 o un valor entre 30 y 360.')
      fps.reportValidity()
      return
    }
    const settings = { maxFps, resolutionScale: Number(scale.value) / 100 }
    runtime.setDisplay(settings)
    label.textContent = `${scale.value}% del perfil`
    const url = new URL(location.href)
    url.searchParams.set('fps', String(settings.maxFps))
    url.searchParams.set('scale', String(settings.resolutionScale))
    history.replaceState(null, '', url)
  }
  fps.addEventListener('input', () => fps.setCustomValidity(''))
  fps.addEventListener('change', apply)
  scale.addEventListener('change', apply)
  document.getElementById('display-apply-quality')!.addEventListener('click', () => {
    const url = new URL(location.href)
    url.searchParams.set('quality', quality.value)
    location.assign(url.href)
  })
}
