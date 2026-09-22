/** Presentation controls; world state and editor commands remain owned by the app. */
export function setupStudioShell(): void {
  const app = document.getElementById('app')!
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.app-menus > button')]
  const menuFor = (button: HTMLButtonElement) =>
    document.getElementById(button.getAttribute('popovertarget')!)!
  const open = (button: HTMLButtonElement, focus = false) => {
    const menu = menuFor(button)
    menu.showPopover()
    if (focus)
      menu.querySelector<HTMLElement>('button:not(:disabled), input, select, summary')?.focus()
  }
  let hoverOpened: HTMLButtonElement | null = null
  for (const [index, button] of buttons.entries()) {
    const menu = menuFor(button)
    button.setAttribute('aria-haspopup', 'true')
    button.setAttribute('aria-expanded', 'false')
    menu.addEventListener('beforetoggle', (event) => {
      if ((event as ToggleEvent).newState !== 'open') return
      const rect = button.getBoundingClientRect()
      menu.style.top = `${rect.bottom + 2}px`
      menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 348))}px`
      for (const command of menu.querySelectorAll<HTMLButtonElement>('[data-command]'))
        command.disabled = (
          document.getElementById(command.dataset.command!) as HTMLButtonElement
        ).disabled
    })
    menu.addEventListener('toggle', () =>
      button.setAttribute('aria-expanded', String(menu.matches(':popover-open'))),
    )
    button.addEventListener('pointerenter', () => {
      if (
        !menu.matches(':popover-open') &&
        buttons.some((b) => menuFor(b).matches(':popover-open'))
      ) {
        open(button)
        hoverOpened = button
      }
    })
    button.addEventListener('click', (event) => {
      // Hover already opened this menu; the ensuing pointer click must not toggle it shut.
      if (hoverOpened === button && event.detail > 0 && menu.matches(':popover-open'))
        event.preventDefault()
      hoverOpened = null
    })
    const navigate = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        menu.hidePopover()
        button.focus()
        return
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const next =
          buttons[(index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length]
        next.focus()
        open(next)
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (event.target === button) {
          open(button, true)
          return
        }
        const items = [
          ...menu.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary'),
        ].filter((el) => el.getClientRects().length)
        const current = items.indexOf(document.activeElement as HTMLElement)
        items[
          (current + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
        ]?.focus()
      }
    }
    button.addEventListener('keydown', navigate)
    menu.addEventListener('keydown', navigate)
  }
  for (const proxy of document.querySelectorAll<HTMLButtonElement>('[data-command]'))
    proxy.onclick = () => {
      document.getElementById(proxy.dataset.command!)!.click()
      proxy.closest<HTMLElement>('[popover]')!.hidePopover()
    }
  const panels = document.getElementById('studio-panels')!
  panels.onclick = () => {
    const hidden = app.classList.toggle('studio-world')
    panels.setAttribute('aria-pressed', String(hidden))
    panels.textContent = hidden ? 'Mostrar paneles del editor' : 'Solo mundo · ocultar paneles'
    document.getElementById('view-menu')!.hidePopover()
  }
  const fullscreen = document.getElementById('studio-fullscreen') as HTMLButtonElement
  fullscreen.disabled = !document.fullscreenEnabled
  fullscreen.onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await app.requestFullscreen()
    } catch {
      fullscreen.textContent = 'Pantalla completa no disponible'
    }
    document.getElementById('view-menu')!.hidePopover()
  }
  document.addEventListener('fullscreenchange', () => {
    fullscreen.textContent = document.fullscreenElement
      ? 'Salir de pantalla completa'
      : 'Pantalla completa'
  })
}
