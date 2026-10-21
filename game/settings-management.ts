import {
  applySettingsBackup,
  exportSettingsBackup,
  parseSettingsBackup,
  restoreSettingsDefaults,
  type SettingsBackup,
} from '../src/runtime/settings-backup.js'
import { t } from '@nabla/engine/i18n'

/** File operations are staged. Selecting a file or opening reset never changes preferences. */
export function createSettingsManagement(
  doc: Document,
  options: { reload(search: string): void; search(): string; local(): Storage; session(): Storage },
): HTMLElement {
  const root = doc.createElement('fieldset')
  root.id = 'settings-management'
  root.className = 'menu-section'
  const legend = doc.createElement('legend')
  legend.textContent = t('manage.settings-management')
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
  note.textContent = t('manage.backup-of-the-saved-game-graphics-sound-camera-v')
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
    status.textContent = t('manage.settings-backup-downloaded')
  }
  const file = doc.createElement('input')
  file.type = 'file'
  file.accept = '.json,application/json'
  file.setAttribute('aria-label', t('manage.settings-json-file'))
  const preview = doc.createElement('fieldset')
  preview.hidden = true
  const summary = doc.createElement('p')
  const replace = doc.createElement('input')
  replace.type = 'checkbox'
  const replaceLabel = doc.createElement('label')
  replaceLabel.append(replace, ' ' + t('manage.replace-missing'))
  let pending: SettingsBackup | null = null,
    generation = 0
  const apply = button(t('manage.apply-settings-and-reload'), () => {
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
    button(t('manage.cancel-import'), () => {
      generation++
      pending = null
      preview.hidden = true
      file.value = ''
      status.textContent = t('manage.import-cancelled-no-setting-was-changed')
    }),
  )
  file.onchange = async () => {
    const current = ++generation
    pending = null
    preview.hidden = true
    const selected = file.files?.[0]
    if (!selected) return
    try {
      if (selected.size > 2 * 1024 * 1024) throw new Error(t('manage.the-file-is-larger-than-2-mb'))
      const data = parseSettingsBackup(await selected.text())
      if (current !== generation) return
      pending = data
      replace.checked = false
      summary.textContent = `Copia del ${new Date(data.createdAt).toLocaleString()} · ${Object.keys(data.local).length + Object.keys(data.session).length} preferencias y ${Object.keys(data.query).length} opciones de pantalla. Incluye mandos USB: ${Object.hasOwn(data.local, 'nabla.usb.controllers.v1') ? 'sí' : 'no'}.`
      preview.hidden = false
      status.textContent = t('manage.file-checked-review-the-backup-before-applying-i')
    } catch (e) {
      if (current === generation)
        status.textContent =
          t('manage.nothing-was-imported') + (e instanceof Error ? e.message : String(e))
    }
  }
  const resetGroup = doc.createElement('fieldset')
  resetGroup.hidden = true
  const caution = doc.createElement('p')
  caution.textContent = t('manage.the-game-preferences-will-be-reset-and-the-page')
  const include = doc.createElement('input')
  include.type = 'checkbox'
  const includeLabel = doc.createElement('label')
  includeLabel.append(include, ' ' + t('manage.clear-calibrations'))
  const understood = doc.createElement('input')
  understood.type = 'checkbox'
  const understoodLabel = doc.createElement('label')
  understoodLabel.append(understood, ' ' + t('manage.understood'))
  const confirm = button(t('manage.confirm-reset-and-reload'), () => {
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
    button(t('manage.save-a-backup-before-resetting'), download),
    includeLabel,
    understoodLabel,
    confirm,
    button(t('manage.cancel-reset'), () => {
      resetGroup.hidden = true
      understood.checked = false
      confirm.disabled = true
    }),
  )
  root.append(
    note,
    button(t('manage.save-all-settings-as-json'), download),
    doc.createElement('hr'),
    file,
    preview,
    doc.createElement('hr'),
    button(t('manage.reset-to-defaults'), () => {
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
