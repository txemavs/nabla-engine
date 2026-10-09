/**
 * «Espejos» in the Vehículos menu, below «Volante»: live sliders that turn each mirror glass of
 * the vehicle the player drives inward / outward («giro») and down / up («inclinación»), on top of
 * the aim baked into its asset. The engine applies, clamps and saves the choice per mirror model
 * (`GameRuntime.setMirrorAngle`); this file only shows it, in degrees.
 */
import { menuSubtitle } from './menu.js'

/** Degrees, as in the engine (`MirrorAngle`): yaw + outward, tilt + up. */
export interface GlassAngle {
  yaw: number
  tilt: number
}

/** What the controls need from `GameRuntime`; tests and pages without mirrors may omit it. */
export interface MirrorRuntime {
  readonly mirrors: {
    name: string
    model: string
    sides: string[]
    adjustment: Record<string, GlassAngle>
    defaultAdjustment: Record<string, GlassAngle>
    saved: boolean
  } | null
  setMirrorAngle(side: string, angle: Partial<GlassAngle>): Record<string, GlassAngle> | null
  resetMirrorAdjustment(): Record<string, GlassAngle> | null
}

/** Slider limits in degrees (the engine's `mirrorAngleRange`). */
export const MIRROR_RANGE = {
  yaw: { min: -25, max: 25, step: 0.5 },
  tilt: { min: -15, max: 15, step: 0.5 },
} as const

/** Each slider spans its default (host / built-in) ±9°, within {@link MIRROR_RANGE}. */
export const MIRROR_SPAN = 9

/** Slider limits centred on `centre` (degrees), within `range`. */
export function centredRange(
  centre: number,
  range: { min: number; max: number },
): { min: number; max: number } {
  return {
    min: Math.max(range.min, centre - MIRROR_SPAN),
    max: Math.min(range.max, centre + MIRROR_SPAN),
  }
}

/** The two sides the menu offers; a vehicle without one of them leaves its sliders disabled. */
export const MIRROR_SIDES = [
  { side: 'left', label: 'izquierdo' },
  { side: 'right', label: 'derecho' },
] as const

/** Degrees as shown to the player: sign, one decimal and a decimal comma, e.g. "+1,5°". */
export function formatMirrorDeg(degrees: number): string {
  const value = Math.round(degrees * 10) / 10
  if (value === 0) return '0,0°'
  return (value > 0 ? '+' : '−') + Math.abs(value).toFixed(1).replace('.', ',') + '°'
}

/** Spanish summary, e.g. "izquierdo giro −2,0° · inclinación +1,0° | derecho giro 0,0° · …". */
export function describeMirrors(adjustment: Record<string, GlassAngle>): string {
  return MIRROR_SIDES.map(({ side, label }) => {
    const angle = adjustment[side] ?? { yaw: 0, tilt: 0 }
    return `${label} giro ${formatMirrorDeg(angle.yaw)} · inclinación ${formatMirrorDeg(angle.tilt)}`
  }).join(' | ')
}

/** The values a host default (`?mirrors=`) or a bake takes, degrees per side. */
export function mirrorBakeValues(adjustment: Record<string, GlassAngle>): string {
  const sides: Record<string, GlassAngle> = {}
  for (const { side } of MIRROR_SIDES) {
    const angle = adjustment[side] ?? { yaw: 0, tilt: 0 }
    sides[side] = { yaw: angle.yaw, tilt: angle.tilt }
  }
  return JSON.stringify(sides)
}

function slider(id: string, text: string, range: { min: number; max: number; step: number }) {
  const input = document.createElement('input')
  input.type = 'range'
  input.id = id
  input.min = String(range.min)
  input.max = String(range.max)
  input.step = String(range.step)
  input.value = '0'
  input.setAttribute('aria-label', text)
  const value = document.createElement('output')
  value.id = `${id}-value`
  value.textContent = formatMirrorDeg(0)
  const row = document.createElement('label')
  row.append(text + ' ', value, input)
  return { row, input, value }
}

/**
 * Build the «Espejos» group (disabled until `bind`). `bind` returns `refresh`, which follows the
 * player into and out of vehicles; call it periodically.
 */
export function mirrorControls(): {
  root: HTMLDivElement
  controls: HTMLElement[]
  bind: (runtime: Partial<MirrorRuntime>) => () => void
} {
  const root = document.createElement('div')
  root.className = 'planet-group'
  root.id = 'scene-mirrors'
  const status = document.createElement('p')
  status.id = 'mirror-status'
  status.setAttribute('role', 'status')
  status.textContent = 'Entra en un vehículo con espejos para ajustarlos.'
  const rows = MIRROR_SIDES.map(({ side, label }) => {
    const yaw = slider(`mirror-${side}-yaw`, `Espejo ${label}: giro`, MIRROR_RANGE.yaw)
    yaw.row.title = '+ lo gira hacia fuera (se ve más por fuera); − hacia dentro (más del costado)'
    const tilt = slider(`mirror-${side}-tilt`, `Espejo ${label}: inclinación`, MIRROR_RANGE.tilt)
    tilt.row.title = '+ lo inclina hacia arriba; − hacia abajo'
    return { side, yaw, tilt }
  })
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.id = 'mirror-reset'
  reset.textContent = 'Restablecer espejos'
  const values = document.createElement('p')
  values.id = 'mirror-values'
  values.className = 'planet-settings-config'
  values.hidden = true
  root.append(
    menuSubtitle('Espejos'),
    status,
    ...rows.flatMap((r) => [r.yaw.row, r.tilt.row]),
    reset,
    values,
  )
  const inputs = rows.flatMap((r) => [r.yaw.input, r.tilt.input])
  // Arrow keys move the slider, not the car.
  for (const input of [...inputs, reset])
    input.addEventListener('keydown', (event) => event.stopPropagation())
  const controls = [...inputs, reset]
  for (const control of controls) control.disabled = true

  const bind = (runtime: Partial<MirrorRuntime>) => {
    let model: string | null = null
    const show = (adjustment: Record<string, GlassAngle>, syncSliders: boolean) => {
      for (const { side, yaw, tilt } of rows) {
        const angle = adjustment[side] ?? { yaw: 0, tilt: 0 }
        yaw.value.textContent = formatMirrorDeg(angle.yaw)
        tilt.value.textContent = formatMirrorDeg(angle.tilt)
        if (syncSliders) {
          yaw.input.value = String(angle.yaw)
          tilt.input.value = String(angle.tilt)
        }
      }
      values.hidden = false
      values.textContent =
        `Espejos: ${describeMirrors(adjustment)}\n` +
        `Valores para fijarlo: ${mirrorBakeValues(adjustment)}`
    }
    const refresh = () => {
      const mirrors = runtime.mirrors ?? null
      const next = mirrors?.model ?? null
      reset.disabled = !mirrors
      for (const { side, yaw, tilt } of rows) {
        const present = !!mirrors?.sides.includes(side)
        yaw.input.disabled = !present
        tilt.input.disabled = !present
      }
      if (!mirrors) {
        model = null
        status.textContent = 'Entra en un vehículo con espejos para ajustarlos.'
        values.hidden = true
        return
      }
      status.textContent =
        `Espejos del ${mirrors.name}` + (mirrors.saved ? ' (ajuste guardado)' : '')
      // Only a new vehicle model moves the sliders; never fight a drag in progress.
      if (next !== model) {
        model = next
        for (const { side, yaw, tilt } of rows) {
          const centre = mirrors.defaultAdjustment[side] ?? { yaw: 0, tilt: 0 }
          const y = centredRange(centre.yaw, MIRROR_RANGE.yaw)
          const t = centredRange(centre.tilt, MIRROR_RANGE.tilt)
          yaw.input.min = String(y.min)
          yaw.input.max = String(y.max)
          tilt.input.min = String(t.min)
          tilt.input.max = String(t.max)
        }
        show(mirrors.adjustment, true)
      }
    }
    for (const { side, yaw, tilt } of rows) {
      const change = () => {
        const applied = runtime.setMirrorAngle?.(side, {
          yaw: Number(yaw.input.value),
          tilt: Number(tilt.input.value),
        })
        if (applied) show(applied, false)
        refresh()
      }
      yaw.input.addEventListener('input', change)
      tilt.input.addEventListener('input', change)
    }
    reset.addEventListener('click', () => {
      const applied = runtime.resetMirrorAdjustment?.()
      if (applied) show(applied, true)
      refresh()
    })
    refresh()
    return refresh
  }
  return { root, controls, bind }
}
