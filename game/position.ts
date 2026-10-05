/** Where the player is, as latitude/longitude, and a way to go to any coordinates (menu section "Posición"). */
import { formatLatLon, parseLatLon, type LatLon } from '@nabla/engine/planet/lat-lon'
import { menuSection } from './menu.js'

/** Position keys a jump replaces; everything else in the URL (quality, layers, vehicle, heading ...) is kept. */
const POSITION_KEYS = ['tile', 'dx', 'dz', 'lat', 'lon', 'll', 'alt'] as const

export interface Jump {
  /** Query string (with `?`) that starts the game at the coordinates, when the text was understood. */
  search?: string
  /** Spanish explanation when it was not. */
  error?: string
}

/** The URL for starting over the position written in `text`, keeping the rest of `search`. */
export function jumpToPosition(search: string, text: string): Jump {
  if (!text.trim())
    return { error: 'Escribe una posición: latitud, longitud (por ejemplo 43.3386, -1.7899).' }
  const point = parseLatLon(text)
  if (!point)
    return {
      error:
        'No entiendo esa posición. Pega «latitud, longitud» en grados (por ejemplo 43.3386, -1.7899, ' +
        'como lo copia Google Maps); la latitud va de −85,05 a 85,05 y la longitud de −180 a 180.',
    }
  const params = new URLSearchParams(search)
  for (const key of POSITION_KEYS) params.delete(key)
  params.set('lat', String(Number(point.latitude.toFixed(6))))
  params.set('lon', String(Number(point.longitude.toFixed(6))))
  return { search: '?' + params.toString() }
}

let current: LatLon | null = null
const listeners = new Set<(position: LatLon | null) => void>()

/** The player's position as text, e.g. "43.33860, -1.78990". */
export function currentPositionText(): string {
  return current ? formatLatLon(current) : ''
}

/** Copy text; works on plain-http pages, where `navigator.clipboard` does not exist. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (globalThis.navigator?.clipboard && globalThis.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
  document.body.append(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

/** Show the player's position in the HUD as "lat, lon" (click to copy) and tell the menu. */
export function showLocation(location: LatLon | null | undefined): void {
  current = location ? { latitude: location.latitude, longitude: location.longitude } : null
  const el = document.getElementById('location-display')
  if (el) {
    el.textContent = currentPositionText()
    if (!el.title) {
      el.title = 'Latitud, longitud actuales. Clic para copiar.'
      el.addEventListener('click', () => void copyText(currentPositionText()))
    }
  }
  for (const listener of listeners) listener(current)
}

/**
 * Menu section "Posición": the live latitude/longitude with a copy button, and a field that takes
 * "latitud, longitud" and restarts at that spot. A spot over a cell the host lacks gets the usual
 * "no hay terreno" message with the button to the nearest available cell.
 */
export function bindPosition(
  search: string = location.search,
  navigate: (next: string) => void = (next) => location.assign(location.pathname + next),
): void {
  const section = menuSection('terrain-position', 'Posición')
  const now = document.createElement('p')
  now.id = 'position-now'
  now.setAttribute('role', 'status')
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.id = 'position-copy'
  copy.textContent = 'Copiar posición'
  const label = document.createElement('label')
  label.textContent = 'Ir a latitud, longitud'
  const input = document.createElement('input')
  input.type = 'text'
  input.id = 'position-input'
  input.placeholder = '43.3386, -1.7899'
  input.autocomplete = 'off'
  input.spellcheck = false
  label.append(input)
  const go = document.createElement('button')
  go.type = 'button'
  go.id = 'position-go'
  go.textContent = 'Ir'
  const message = document.createElement('p')
  message.id = 'position-message'
  message.setAttribute('role', 'status')
  section.append(now, copy, label, go, message)

  const update = (position: LatLon | null) => {
    now.textContent = position ? `Ahora: ${formatLatLon(position)}` : 'Ahora: sin posición todavía'
    copy.disabled = !position
  }
  listeners.add(update)
  update(current)

  copy.addEventListener('click', async () => {
    message.textContent = (await copyText(currentPositionText()))
      ? 'Posición copiada.'
      : 'No se pudo copiar: selecciona el texto de arriba.'
  })
  const submit = () => {
    const jump = jumpToPosition(search, input.value)
    if (jump.error) {
      message.textContent = jump.error
      return
    }
    message.textContent = 'Yendo…'
    navigate(jump.search!)
  }
  go.addEventListener('click', submit)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit()
    event.stopPropagation()
  })
}
