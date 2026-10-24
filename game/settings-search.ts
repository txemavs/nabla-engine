import { t } from '@nabla/engine/i18n'
import { keyboardAction } from '@nabla/engine/config/controls'

export interface SettingsSearchEntry {
  id: string
  title: string
  path: string
  text: string
}

/** Search every word, ignoring accents and case; display paths disambiguate repeated labels. */
export function matchingSettings(
  entries: SettingsSearchEntry[],
  query: string,
): SettingsSearchEntry[] {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase()
  const words = normalize(query).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return entries.filter((entry) => {
    const text = normalize(`${entry.path} ${entry.title} ${entry.text}`)
    return words.every((word) => text.includes(word))
  })
}

/** Navigation only: never duplicates controls or writes settings. Entries are read on each query. */
export function createSettingsSearch(
  doc: Document,
  entries: () => SettingsSearchEntry[],
  activate: (id: string) => void,
) {
  const root = doc.createElement('div')
  root.className = 'settings-search'
  const input = doc.createElement('input')
  input.type = 'search'
  input.id = 'settings-search'
  input.placeholder = t('settings.search-settings')
  input.setAttribute('aria-label', t('settings.search-settings'))
  input.setAttribute('aria-controls', 'settings-search-results')
  input.autocomplete = 'off'
  const clear = doc.createElement('button')
  clear.type = 'button'
  clear.textContent = '×'
  clear.setAttribute('aria-label', t('settings.clear-search'))
  const results = doc.createElement('div')
  results.id = 'settings-search-results'
  results.className = 'settings-search-results'
  results.setAttribute('role', 'region')
  results.setAttribute('aria-label', t('settings.search-settings'))
  results.hidden = true
  const reset = () => {
    input.value = ''
    results.replaceChildren()
    results.hidden = true
    clear.hidden = true
  }
  const refresh = () => {
    const query = input.value.trim()
    clear.hidden = !query
    results.hidden = !query
    results.replaceChildren()
    if (!query) return
    const found = matchingSettings(entries(), query)
    if (!found.length) {
      const status = doc.createElement('p')
      status.setAttribute('role', 'status')
      status.textContent = t('settings.no-settings-results')
      results.append(status)
    }
    for (const entry of found) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.textContent = `${entry.path} → ${entry.title}`
      button.addEventListener('click', () => {
        reset()
        activate(entry.id)
      })
      results.append(button)
    }
  }
  clear.addEventListener('click', () => {
    reset()
    input.focus()
  })
  input.addEventListener('input', refresh)
  root.addEventListener('keydown', (event) => {
    const action = keyboardAction(event.code, { mode: 'road', menu: true })
    const buttons = [...results.querySelectorAll<HTMLButtonElement>('button')]
    const current = buttons.indexOf(doc.activeElement as HTMLButtonElement)
    if (action === 'menu.down' || action === 'menu.up') {
      event.preventDefault()
      const next = action === 'menu.down' ? current + 1 : current - 1
      if (next < 0) input.focus()
      else buttons[Math.min(next, buttons.length - 1)]?.focus()
    } else if (action === 'menu.accept' && doc.activeElement === input) {
      event.preventDefault()
      buttons[0]?.click()
    }
  })
  reset()
  root.append(input, clear, results)
  return { root, reset, refresh }
}
