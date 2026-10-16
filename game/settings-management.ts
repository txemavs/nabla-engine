import {
  applySettingsBackup,
  exportSettingsBackup,
  parseSettingsBackup,
  restoreSettingsDefaults,
  type SettingsBackup,
} from '../src/runtime/settings-backup.js'

/** File operations are staged. Selecting a file or opening reset never changes preferences. */
export function createSettingsManagement(
  doc: Document,
  options: { reload(search: string): void; search(): string; local(): Storage; session(): Storage },
): HTMLElement {
  const root = doc.createElement('fieldset')
  root.id = 'settings-management'
  root.className = 'menu-section'
  const legend = doc.createElement('legend')
  legend.textContent = 'Gestión de ajustes'
  root.append(legend)
  const status = doc.createElement('p')
  status.setAttribute('role', 'status')
  const button = (text: string, run: () => void) => {
    const b = doc.createElement('button')
    b.type = 'button'
    b.textContent = text
    b.onclick = () => {
      try {
        run()
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : String(e)
      }
    }
    return b
  }
  const note = doc.createElement('p')
  note.textContent =
    'Copia de las preferencias guardadas del juego, gráficos, sonido, cámaras, vehículos, mandos y casco. Los mapas descargados y las escenas no forman parte de esta copia.'
  const download = () => {
    const backup = exportSettingsBackup(options.local(), options.session(), options.search())
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
    )
    const a = doc.createElement('a')
    a.href = url
    a.download = `nabla-ajustes-${backup.createdAt.slice(0, 10)}.json`
    doc.body.append(a)
    a.click()
    a.remove()
    doc.defaultView?.setTimeout(() => URL.revokeObjectURL(url), 1000)
    status.textContent = 'Copia de ajustes descargada.'
  }
  const file = doc.createElement('input')
  file.type = 'file'
  file.accept = '.json,application/json'
  file.setAttribute('aria-label', 'Archivo JSON de ajustes')
  const preview = doc.createElement('fieldset')
  preview.hidden = true
  const summary = doc.createElement('p')
  const replace = doc.createElement('input')
  replace.type = 'checkbox'
  const replaceLabel = doc.createElement('label')
  replaceLabel.append(replace, ' Reemplazar también los ajustes que no estén incluidos en la copia')
  let pending: SettingsBackup | null = null,
    generation = 0
  const apply = button('Aplicar ajustes y recargar', () => {
    if (!pending) return
    const search = applySettingsBackup(
      pending,
      options.local(),
      options.session(),
      options.search(),
      replace.checked,
    )
    options.reload(search)
  })
  preview.append(
    summary,
    replaceLabel,
    apply,
    button('Cancelar importación', () => {
      generation++
      pending = null
      preview.hidden = true
      file.value = ''
      status.textContent = 'Importación cancelada. No se ha cambiado ningún ajuste.'
    }),
  )
  file.onchange = async () => {
    const current = ++generation
    pending = null
    preview.hidden = true
    const selected = file.files?.[0]
    if (!selected) return
    try {
      if (selected.size > 2 * 1024 * 1024) throw new Error('El archivo supera 2 MB.')
      const data = parseSettingsBackup(await selected.text())
      if (current !== generation) return
      pending = data
      replace.checked = false
      summary.textContent = `Copia del ${new Date(data.createdAt).toLocaleString()} · ${Object.keys(data.local).length + Object.keys(data.session).length} preferencias y ${Object.keys(data.query).length} opciones de pantalla. Incluye mandos USB: ${Object.hasOwn(data.local, 'nabla.usb.controllers.v1') ? 'sí' : 'no'}.`
      preview.hidden = false
      status.textContent =
        'Archivo comprobado. Revisa la copia antes de aplicarla. Por defecto se conservan los ajustes no incluidos.'
    } catch (e) {
      if (current === generation)
        status.textContent =
          'No se ha importado nada: ' + (e instanceof Error ? e.message : String(e))
    }
  }
  const resetGroup = doc.createElement('fieldset')
  resetGroup.hidden = true
  const caution = doc.createElement('p')
  caution.textContent =
    'Se restablecerán las preferencias del juego y se recargará la página. Por defecto se conservan las calibraciones USB y del casco. Puedes guardar una copia antes de continuar.'
  const include = doc.createElement('input')
  include.type = 'checkbox'
  const includeLabel = doc.createElement('label')
  includeLabel.append(include, ' Borrar también las calibraciones de mandos USB y casco')
  const understood = doc.createElement('input')
  understood.type = 'checkbox'
  const understoodLabel = doc.createElement('label')
  understoodLabel.append(understood, ' Entiendo qué ajustes se van a restablecer')
  const confirm = button('Confirmar restablecimiento y recargar', () => {
    if (!understood.checked) return
    options.reload(
      restoreSettingsDefaults(
        options.local(),
        options.session(),
        options.search(),
        include.checked,
      ),
    )
  })
  confirm.disabled = true
  understood.onchange = () => {
    confirm.disabled = !understood.checked
  }
  resetGroup.append(
    caution,
    button('Guardar copia antes de restablecer', download),
    includeLabel,
    understoodLabel,
    confirm,
    button('Cancelar restablecimiento', () => {
      resetGroup.hidden = true
      understood.checked = false
      confirm.disabled = true
    }),
  )
  root.append(
    note,
    button('Guardar todos los ajustes en JSON', download),
    doc.createElement('hr'),
    file,
    preview,
    doc.createElement('hr'),
    button('Restablecer valores predeterminados…', () => {
      resetGroup.hidden = false
      include.checked = false
      understood.checked = false
      confirm.disabled = true
    }),
    resetGroup,
    status,
  )
  return root
}
