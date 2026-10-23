import { pageSearch } from './page-query.js'
import { resolveFsr, type FsrSettings } from '../src/render/effects/fsr1.js'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { t } from '@nabla/engine/i18n'
const KEY = 'nabla.fsr1'

/** Apply before preload, so startup prepares the actual chosen render path. */
export function readFsrSettings(search = pageSearch()): FsrSettings {
  let saved: Partial<FsrSettings> = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    /* optional storage */
  }
  const params = new URLSearchParams(search)
  try {
    return resolveFsr({
      ...saved,
      ...(params.has('fsr') ? { mode: params.get('fsr') as FsrSettings['mode'] } : {}),
      ...(params.has('fsrSharpness')
        ? { sharpness: Number(params.get('fsrSharpness')) / 100 }
        : {}),
    })
  } catch {
    return resolveFsr()
  }
}

export function appendFsrControls(parent: HTMLElement, runtime: GameRuntime): void {
  const doc = parent.ownerDocument
  const label = doc.createElement('label')
  label.textContent = t('settings.fsr') + ' '
  const select = doc.createElement('select')
  select.id = 'display-fsr'
  for (const [value, text] of [
    ['off', t('settings.fsr.off')],
    ['ultra-quality', t('settings.fsr.ultra-quality')],
    ['quality', t('settings.fsr.quality')],
    ['balanced', t('settings.fsr.balanced')],
    ['performance', t('settings.fsr.performance')],
  ]) {
    const option = doc.createElement('option')
    option.value = value
    option.textContent = text
    select.append(option)
  }
  label.append(select)
  const sharpLabel = doc.createElement('label')
  sharpLabel.textContent = t('settings.fsr-sharpness') + ' '
  const sharp = doc.createElement('input')
  sharp.id = 'display-fsr-sharpness'
  sharp.type = 'range'
  sharp.min = '0'
  sharp.max = '100'
  sharp.step = '1'
  const value = doc.createElement('output')
  value.htmlFor = sharp.id
  sharpLabel.append(sharp, value)
  const hint = doc.createElement('small')
  hint.textContent = t('settings.fsr-hint')
  const sync = () => {
    const settings = runtime.fsrSettings
    select.value = settings.mode
    sharp.value = String(Math.round(settings.sharpness * 100))
    sharp.disabled = settings.mode === 'off'
    value.textContent = sharp.value + '%'
  }
  const apply = () => {
    runtime.setFsr({
      mode: select.value as FsrSettings['mode'],
      sharpness: Number(sharp.value) / 100,
    })
    sync()
    try {
      localStorage.setItem(KEY, JSON.stringify(runtime.fsrSettings))
    } catch {
      /* optional storage */
    }
    const url = new URL(location.href)
    url.searchParams.set('fsr', runtime.fsrSettings.mode)
    url.searchParams.set('fsrSharpness', sharp.value)
    history.replaceState(null, '', url)
  }
  select.addEventListener('change', apply)
  sharp.addEventListener('input', apply)
  sync()
  parent.append(label, sharpLabel, hint)
}
