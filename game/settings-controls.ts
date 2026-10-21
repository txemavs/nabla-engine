/** Keyboard help reads the Engine catalog directly; no parallel list of assignments. */
import {
  controlsFor,
  inputBindings,
  inputChords,
  keyLabel,
  type InputContext,
} from '@nabla/engine/config/controls'
import { t } from '@nabla/engine/i18n'

export function createControlsSection(doc: Document): HTMLElement {
  const root = doc.createElement('fieldset')
  root.id = 'settings-controls'
  root.className = 'menu-section'
  const legend = doc.createElement('legend')
  legend.textContent = t('settings.keys')
  const tools = doc.createElement('div')
  tools.className = 'settings-key-tools'
  const search = doc.createElement('input')
  search.type = 'search'
  search.placeholder = t('settings.keys.search')
  search.setAttribute('aria-label', t('settings.keys.search-label'))
  const context = doc.createElement('select')
  context.setAttribute('aria-label', t('settings.keys.context'))
  const contexts: Array<[string, InputContext | undefined]> = [
    [t('settings.keys.ctx.all'), undefined],
    [t('settings.keys.ctx.walk'), { mode: 'walk' }],
    [t('settings.keys.ctx.road'), { mode: 'road' }],
    [t('settings.keys.ctx.bike'), { mode: 'bike' }],
    [t('settings.keys.ctx.forklift'), { mode: 'forklift' }],
    [t('settings.keys.ctx.flight'), { mode: 'flight' }],
    [t('settings.keys.ctx.weapon'), { mode: 'walk', weapon: true }],
    [t('settings.keys.ctx.aiming'), { mode: 'walk', weapon: true, aiming: true }],
    [t('settings.keys.ctx.menu'), { mode: 'road', menu: true }],
    [t('settings.keys.ctx.viewer'), { mode: 'viewer' }],
  ]
  contexts.forEach(([label], index) => {
    const option = doc.createElement('option')
    option.value = String(index)
    option.textContent = label
    context.append(option)
  })
  const table = doc.createElement('table')
  table.className = 'settings-key-table'
  const thead = doc.createElement('thead'),
    heading = doc.createElement('tr')
  for (const label of [t('settings.keys.action'), t('settings.keys')]) {
    const th = doc.createElement('th')
    th.scope = 'col'
    th.textContent = label
    heading.append(th)
  }
  thead.append(heading)
  const body = doc.createElement('tbody')
  table.append(thead, body)
  const info = doc.createElement('p')
  info.className = 'settings-note'
  info.textContent =
    'Las acciones dependen del vehículo y del contexto. Armas, apuntado y menús tienen prioridad. Ratón: clic izquierdo dispara; clic derecho apunta.'
  const empty = doc.createElement('p')
  empty.textContent = 'No hay coincidencias.'
  empty.hidden = true
  const refresh = () => {
    const selected = contexts[Number(context.value)]?.[1]
    const bindings = selected
      ? controlsFor(selected)
      : Object.entries(inputBindings).map(([action, binding]) => ({ action, ...binding }))
    const rows = bindings
      .filter((binding) => binding.keys.length)
      .map((binding) => ({
        action: binding.action,
        label: binding.label,
        keys: [...new Set(binding.keys.map(keyLabel))].join(' / '),
      }))
    if (!selected)
      for (const [id, actions] of Object.entries(inputChords))
        rows.push({
          action: id,
          label: id === 'prone' ? 'Cuerpo a tierra' : 'Salida fuerte / gas completo',
          keys: actions
            .map((action) => [...new Set(inputBindings[action].keys.map(keyLabel))].join(' / '))
            .join(' + '),
        })
    const query = search.value.trim().toLocaleLowerCase('es')
    const matches = rows.filter((row) =>
      `${row.label} ${row.action} ${row.keys}`.toLocaleLowerCase('es').includes(query),
    )
    body.replaceChildren(
      ...matches.map((row) => {
        const tr = doc.createElement('tr'),
          name = doc.createElement('td'),
          keys = doc.createElement('td')
        name.textContent = row.label
        const id = doc.createElement('small')
        id.textContent = row.action
        name.append(id)
        const kbd = doc.createElement('kbd')
        kbd.textContent = row.keys
        keys.append(kbd)
        tr.append(name, keys)
        return tr
      }),
    )
    empty.hidden = matches.length > 0
  }
  search.addEventListener('input', refresh)
  context.addEventListener('change', refresh)
  tools.append(search, context)
  root.append(legend, tools, table, empty, info)
  refresh()
  return root
}
