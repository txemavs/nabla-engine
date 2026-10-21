/**
 * Menu section «Distancias»: every distance that decides how far the world is drawn, in one place.
 *
 * - Terrain draw distance (the load radius), ground detail distance: existing controls, moved here.
 * - Fog, road, building, collision and far-relief distances: live controls over the quality
 *   profile's own values (`GameRuntime.setVisibility`). Nothing is applied until the player picks
 *   something, so the defaults stay exactly those of the active profile.
 * Choices are remembered per quality profile under `nabla.visibility`.
 */
import { visibilityChoices, type VisibilitySettings } from '@nabla/engine/config/performance'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import {
  VISIBILITY_STORAGE_KEY,
  parseStoredVisibility,
  serializeVisibility,
} from '../src/runtime/visibility-settings.js'
import { browserStorage } from './entry.js'
import { menuSection } from './menu.js'
import { t } from '@nabla/engine/i18n'

type Field = keyof VisibilitySettings

export const km = (metres: number): string =>
  metres >= 1000 ? `${metres / 1000} km` : `${metres} m`

/** Rows built here, in menu order; the label is the Spanish UI text. */
export const distanceRows: ReadonlyArray<{
  field: Field
  id: string
  label: string
  format: (value: number) => string
}> = [
  { field: 'fog', id: 'distance-fog', label: 'Niebla', format: km },
  {
    field: 'roads',
    id: 'distance-roads',
    label: 'Carreteras',
    format: (value) => (value === 0 ? 'Ocultas' : km(value)),
  },
  {
    field: 'buildings',
    id: 'distance-buildings',
    label: 'Edificios',
    format: (value) => (value ? 'Visibles' : 'Ocultos'),
  },
  { field: 'collisions', id: 'distance-collisions', label: 'Colisiones', format: km },
  {
    field: 'relief',
    id: 'distance-relief',
    label: 'Relieve lejano',
    format: (value) => `${2 * value + 1}×${2 * value + 1} celdas`,
  },
]

/** Move an existing control's label into the section, keeping its listeners and storage. */
function adopt(section: HTMLElement, controlId: string, text?: string): void {
  const label = document.getElementById(controlId)?.closest('label')
  if (!label) return
  if (text) {
    const node = [...label.childNodes].find(
      (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim(),
    )
    if (node) node.textContent = text + ' '
  }
  section.append(label)
}

export function bindDistances(
  runtime: GameRuntime,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = browserStorage(),
): HTMLElement {
  const section = menuSection('settings-distances', t('settings.distances'))
  const live = runtime.visibility
  let remembered: Partial<VisibilitySettings> = {}
  try {
    remembered = parseStoredVisibility(storage?.getItem(VISIBILITY_STORAGE_KEY), live.preset)
  } catch {
    /* Storage is optional. */
  }
  if (Object.keys(remembered).length) runtime.setVisibility(remembered)

  // Existing controls first: terrain draw distance (a km list) and ground detail (cells ≈ km).
  adopt(section, 'terrain-cache-distance', 'Distancia de dibujo del terreno')
  for (const row of distanceRows) {
    const select = document.createElement('select')
    select.id = row.id
    const current = runtime.visibility[row.field]
    for (const value of visibilityChoices[row.field] as readonly number[])
      select.add(new Option(row.format(value), String(value)))
    select.value = String(current)
    select.addEventListener('change', () => {
      const value = Number(select.value)
      runtime.setVisibility({ [row.field]: value })
      remembered = { ...remembered, [row.field]: value }
      try {
        storage?.setItem(VISIBILITY_STORAGE_KEY, serializeVisibility(live.preset, remembered))
      } catch {
        /* Remembering is optional. */
      }
    })
    const label = document.createElement('label')
    label.append(row.label + ' ', select)
    section.append(label)
  }
  adopt(section, 'ground-detail')
  const note = document.createElement('p')
  note.textContent =
    'Cada perfil de calidad trae sus distancias; lo que elijas aquí se recuerda para ese perfil. ' +
    'Más distancia cuesta más fotogramas. Los valores se aplican al momento.'
  section.append(note)
  return section
}
