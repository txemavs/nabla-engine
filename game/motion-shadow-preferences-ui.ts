import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { t } from '@nabla/engine/i18n'
import { shadowTiers } from '@nabla/engine/config/shadows'

/** These panels edit runtime-owned preferences, never process-wide tuning. */
export function createMotionShadowSections(doc: Document, runtime: GameRuntime): HTMLElement[] {
  const sections: HTMLElement[] = []
  const section = (id: string, title: string) => {
    const root = doc.createElement('fieldset'),
      legend = doc.createElement('legend')
    root.id = id
    root.className = 'menu-section'
    legend.textContent = t(title)
    root.append(legend)
    sections.push(root)
    return root
  }
  const seconds = (
    root: HTMLElement,
    id: string,
    title: string,
    value: number,
    min: number,
    max: number,
    step: number,
    set: (value: number) => number,
  ) => {
    const label = doc.createElement('label'),
      input = doc.createElement('input')
    label.textContent = t(title)
    input.id = id
    input.type = 'number'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(value)
    input.setAttribute('aria-label', t(title))
    input.addEventListener('change', () => {
      const next = input.valueAsNumber
      input.value = String(set(Number.isFinite(next) ? Math.max(min, Math.min(max, next)) : value))
    })
    label.append(input)
    root.append(label)
    return input
  }
  if (runtime.cameraMotionPreferences) {
    const root = section('settings-camera-motion', 'motion.camera')
    const settings = runtime.cameraMotionPreferences
    const label = doc.createElement('label'),
      enabled = doc.createElement('input')
    enabled.id = 'camera-auto-center'
    enabled.type = 'checkbox'
    enabled.checked = settings.autoCenter
    label.append(enabled, doc.createTextNode(t('motion.auto-center')))
    root.append(label)
    const delay = seconds(
      root,
      'camera-auto-center-delay',
      'motion.delay',
      settings.autoCenterDelayMs / 1000,
      0,
      30,
      0.1,
      (value) =>
        runtime.setCameraMotionPreferences({ autoCenterDelayMs: value * 1000 }).autoCenterDelayMs /
        1000,
    )
    const blend = seconds(
      root,
      'camera-auto-center-blend',
      'motion.blend',
      settings.autoCenterBlendMs / 1000,
      0,
      5,
      0.1,
      (value) =>
        runtime.setCameraMotionPreferences({ autoCenterBlendMs: value * 1000 }).autoCenterBlendMs /
        1000,
    )
    const refresh = () => {
      delay.disabled = blend.disabled = !enabled.checked
    }
    enabled.addEventListener('change', () => {
      runtime.setCameraMotionPreferences({ autoCenter: enabled.checked })
      refresh()
    })
    refresh()
    seconds(
      root,
      'camera-transition',
      'motion.transition',
      settings.modeTransitionMs / 1000,
      0,
      3,
      0.1,
      (value) =>
        runtime.setCameraMotionPreferences({ modeTransitionMs: value * 1000 }).modeTransitionMs /
        1000,
    )
    const note = doc.createElement('p')
    note.className = 'settings-note'
    note.textContent = t('motion.camera-note')
    root.append(note)
  }
  if (runtime.inputPreferences) {
    const root = section('settings-keyboard-response', 'motion.keyboard')
    const settings = runtime.inputPreferences
    seconds(
      root,
      'keyboard-rise',
      'motion.steering-rise',
      settings.steeringRiseSeconds,
      0.01,
      2,
      0.01,
      (value) => runtime.setInputPreferences({ steeringRiseSeconds: value }).steeringRiseSeconds,
    )
    seconds(
      root,
      'keyboard-release',
      'motion.steering-release',
      settings.steeringReleaseSeconds,
      0.01,
      2,
      0.01,
      (value) =>
        runtime.setInputPreferences({ steeringReleaseSeconds: value }).steeringReleaseSeconds,
    )
    const note = doc.createElement('p')
    note.className = 'settings-note'
    note.textContent = t('motion.keyboard-note')
    root.append(note)
  }
  if (runtime.saveSunShadowQuality) {
    const root = section('settings-shadow-quality', 'motion.shadow-quality')
    const label = doc.createElement('label'),
      select = doc.createElement('select')
    label.textContent = t('motion.shadow-quality')
    select.id = 'sun-shadow-quality'
    const option = (value: string, text: string) => {
      const opt = doc.createElement('option')
      opt.value = value
      opt.textContent = text
      select.append(opt)
    }
    option('profile', t('motion.profile'))
    for (const [key, tier] of Object.entries(shadowTiers))
      option(
        key,
        tier
          ? t('motion.shadow-tier', { size: tier.mapSize, count: tier.cascades })
          : t('motion.shadow-off'),
      )
    select.value =
      runtime.sunShadowQualityOverride === null
        ? 'profile'
        : String(runtime.sunShadowQualityOverride)
    label.append(select)
    root.append(label)
    const note = doc.createElement('p')
    note.className = 'settings-note'
    note.textContent = t('motion.shadow-note')
    root.append(note)
    const apply = doc.createElement('button'),
      status = doc.createElement('p')
    apply.type = 'button'
    apply.textContent = t('motion.apply-reload')
    status.setAttribute('role', 'status')
    apply.addEventListener('click', () => {
      try {
        runtime.saveSunShadowQuality(select.value === 'profile' ? null : Number(select.value))
        runtime.pause()
        doc.defaultView?.location.reload()
      } catch {
        status.textContent = t('motion.save-failed')
      }
    })
    root.append(apply, status)
  }
  return sections
}
