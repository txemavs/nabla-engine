/** Ajustes → Opciones → Sonido: General, Motor and Música sliders plus a music mute. Saved by the runtime. */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'
import { t } from '@nabla/engine/i18n'

type Mix = GameRuntime['audioMix']
type SliderKey = 'master' | 'engine' | 'music'

const SLIDERS: ReadonlyArray<readonly [key: SliderKey, id: string, labelKey: string]> = [
  ['master', 'sound-master', 'settings.sound-master'],
  ['engine', 'sound-engine', 'settings.engine'],
  ['music', 'sound-music', 'settings.sound-music'],
]

/** Percentage label for a 0..1 slider value. */
export function soundPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function bindSoundControls(
  runtime: Pick<GameRuntime, 'audioMix' | 'setAudioMix'>,
): HTMLFieldSetElement {
  const group = menuSection('settings-sound', t('settings.sound'))
  const outputs = new Map<SliderKey, [HTMLInputElement, HTMLOutputElement]>()
  for (const [key, id, text] of SLIDERS) {
    const label = document.createElement('label')
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.id = id
    slider.min = '0'
    slider.max = '100'
    slider.step = '1'
    const output = document.createElement('output')
    output.htmlFor.add(id)
    slider.addEventListener('input', () => {
      const mix = runtime.setAudioMix({ [key]: Number(slider.value) / 100 } as Partial<Mix>)
      output.textContent = soundPercent(mix[key])
    })
    label.append(`${t(text)} `, slider, ' ', output)
    group.append(label)
    outputs.set(key, [slider, output])
  }
  const muteLabel = document.createElement('label')
  const mute = document.createElement('input')
  mute.type = 'checkbox'
  mute.id = 'sound-music-mute'
  mute.addEventListener('change', () => runtime.setAudioMix({ musicMuted: mute.checked }))
  muteLabel.append(mute, ' ' + t('settings.mute-music'))
  group.append(muteLabel)
  const mix = runtime.audioMix
  for (const [key, [slider, output]] of outputs) {
    slider.value = String(Math.round(mix[key] * 100))
    output.textContent = soundPercent(mix[key])
  }
  mute.checked = mix.musicMuted
  return group
}
