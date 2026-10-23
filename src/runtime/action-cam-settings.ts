import { actionCamTuning } from '../config/gameplay-tuning.js'
import { t } from '../i18n/index.js'

export type ActionCamSettings = Omit<typeof actionCamTuning, 'enabled'>
export type ActionCamKey = keyof ActionCamSettings
/** UI values use centimetres/degrees; simulation values remain SI. */
export const actionCamControls: Array<{
  key: ActionCamKey
  label: string
  group: string
  min: number
  max: number
  step: number
  scale: number
  unit: string
}> = [
  {
    key: 'strideMetres',
    label: t('settings.action-cam.stride'),
    group: t('settings.action-cam.group.rhythm'),
    min: 0.8,
    max: 6,
    step: 0.05,
    scale: 1,
    unit: 'm',
  },
  {
    key: 'referenceSpeed',
    label: t('settings.action-cam.reference-speed'),
    group: t('settings.action-cam.group.rhythm'),
    min: 1,
    max: 12,
    step: 0.1,
    scale: 1,
    unit: 'm/s',
  },
  {
    key: 'maxSpeed',
    label: t('settings.action-cam.max-speed'),
    group: t('settings.action-cam.group.rhythm'),
    min: 1,
    max: 16,
    step: 0.1,
    scale: 1,
    unit: 'm/s',
  },
  {
    key: 'bobMetres',
    label: t('settings.action-cam.bob'),
    group: t('settings.action-cam.group.rhythm'),
    min: 0,
    max: 8,
    step: 0.05,
    scale: 100,
    unit: 'cm',
  },
  {
    key: 'swayMetres',
    label: t('settings.action-cam.sway'),
    group: t('settings.action-cam.group.rhythm'),
    min: 0,
    max: 5,
    step: 0.05,
    scale: 100,
    unit: 'cm',
  },
  {
    key: 'stepRollRadians',
    label: t('settings.action-cam.step-roll'),
    group: t('settings.action-cam.group.angles'),
    min: 0,
    max: 5,
    step: 0.05,
    scale: 180 / Math.PI,
    unit: '°',
  },
  {
    key: 'stepPitchRadians',
    label: t('settings.action-cam.step-pitch'),
    group: t('settings.action-cam.group.angles'),
    min: 0,
    max: 5,
    step: 0.05,
    scale: 180 / Math.PI,
    unit: '°',
  },
  {
    key: 'strafeRollRadians',
    label: t('settings.action-cam.strafe-roll'),
    group: t('settings.action-cam.group.angles'),
    min: 0,
    max: 8,
    step: 0.05,
    scale: 180 / Math.PI,
    unit: '°',
  },
  {
    key: 'maxTurnRollRadians',
    label: t('settings.action-cam.max-turn-roll'),
    group: t('settings.action-cam.group.angles'),
    min: 0,
    max: 12,
    step: 0.05,
    scale: 180 / Math.PI,
    unit: '°',
  },
  {
    key: 'turnLeanSeconds',
    label: t('settings.action-cam.turn-lean'),
    group: t('settings.action-cam.group.response-aiming'),
    min: 0,
    max: 0.15,
    step: 0.005,
    scale: 1,
    unit: 's',
  },
  {
    key: 'response',
    label: t('settings.action-cam.response'),
    group: t('settings.action-cam.group.response-aiming'),
    min: 1,
    max: 20,
    step: 0.1,
    scale: 1,
    unit: '1/s',
  },
  {
    key: 'aimedScale',
    label: t('settings.action-cam.aimed-scale'),
    group: t('settings.action-cam.group.response-aiming'),
    min: 0,
    max: 100,
    step: 1,
    scale: 100,
    unit: '%',
  },
]
export function normalizeActionCamSettings(value: unknown): ActionCamSettings {
  const { enabled: _enabled, ...settings } = actionCamTuning
  if (!value || typeof value !== 'object') return settings
  for (const control of actionCamControls) {
    const v = (value as Record<string, unknown>)[control.key]
    if (typeof v === 'number' && Number.isFinite(v))
      settings[control.key] = Math.max(
        control.min / control.scale,
        Math.min(control.max / control.scale, v),
      )
  }
  return settings
}
export const softActionCamSettings: Partial<ActionCamSettings> = {
  strideMetres: 2.8,
  bobMetres: 0.012,
  swayMetres: 0.007,
  stepRollRadians: 0.005,
  stepPitchRadians: 0.003,
  strafeRollRadians: 0.012,
  turnLeanSeconds: 0.035,
  maxTurnRollRadians: 0.045,
  response: 5,
  aimedScale: 0.15,
}
