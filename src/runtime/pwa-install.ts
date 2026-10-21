/**
 * Install button for the web app: an icon `.nabla-btn` in a screen corner that only appears when
 * the browser offers installation (`beforeinstallprompt`, captured early by the `<head>` tags of
 * `@nabla/engine/pwa` as `window.nablaInstallPrompt`). It disappears once installed, when the
 * player dismisses the prompt, and never shows inside the installed app.
 */
import { addCornerButton, type Corner } from './corner-buttons.js'

/** The non-standard Chromium event behind installation. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    nablaInstallPrompt?: InstallPromptEvent
  }
}

export interface InstallButtonOptions {
  t: (key: string) => string
  /** i18n key of the tooltip. Default `pwa.install`. */
  labelKey?: string
  /** Default `tr`. */
  corner?: Corner
  /** Order in the corner group. Default 70. */
  order?: number
  id?: string
}

const INSTALL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>'

/** Whether the page already runs as an installed app. */
export function isInstalledApp(win: Window = window): boolean {
  return ['fullscreen', 'standalone', 'minimal-ui'].some(
    (mode) => win.matchMedia?.(`(display-mode: ${mode})`).matches,
  )
}

/** Watch for the install offer and show the button while it is available. */
export function mountInstallButton(doc: Document, options: InstallButtonOptions): void {
  const win = doc.defaultView
  if (!win || isInstalledApp(win)) return
  const label = options.t(options.labelKey ?? 'pwa.install')
  let button: HTMLButtonElement | undefined
  const hide = () => {
    button?.remove()
    button = undefined
  }
  const show = () => {
    if (button || !win.nablaInstallPrompt) return
    button = doc.createElement('button')
    button.type = 'button'
    if (options.id) button.id = options.id
    button.className = 'nabla-btn nabla-btn--icon'
    button.innerHTML = INSTALL_ICON
    button.title = label
    button.setAttribute('aria-label', label)
    button.addEventListener('click', async () => {
      const prompt = win.nablaInstallPrompt
      if (!prompt) return hide()
      win.nablaInstallPrompt = undefined
      hide()
      await prompt.prompt()
      await prompt.userChoice
    })
    addCornerButton(options.corner ?? 'tr', button, options.order ?? 70, doc)
  }
  win.addEventListener('nabla-installable', show)
  win.addEventListener('appinstalled', hide)
  show()
}
