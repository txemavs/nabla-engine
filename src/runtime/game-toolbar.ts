import { cameraFovDefault, cameraFovRange } from './camera-fov.js'

/** Shared layout, icon appearance and ordered groups for the gameplay action rail. */
export class GameToolbar {
  readonly root = document.createElement('div')
  private readonly lifetime = new AbortController()
  static styleButton(button: HTMLButtonElement): void {
    button.style.cssText =
      'width:44px;height:44px;flex:none;display:grid;place-items:center;padding:0;border:2px solid #395e79;border-radius:12px;background:#142735;color:#c6e6ff;touch-action:none;cursor:pointer'
  }
  constructor(host: HTMLElement, read: () => number, write: (value: number) => void) {
    this.root.className = 'game-toolbar'
    this.root.setAttribute('role', 'group')
    this.root.setAttribute('aria-label', 'Controles del juego')
    this.root.style.cssText =
      'position:fixed;right:20px;top:72px;z-index:48;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:auto;max-height:calc(100% - 70px)'
    this.setVisible(false)
    const group = document.createElement('div')
    group.style.cssText = 'order:30;position:relative'
    const button = document.createElement('button')
    button.type = 'button'
    button.title = 'Campo de visión (FOV)'
    button.setAttribute('aria-label', button.title)
    button.setAttribute('aria-expanded', 'false')
    button.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4H3v6m12-6h6v6M3 14v6h6m6 0h6v-6M8 12h8m-6-2-2 2 2 2m4-4 2 2-2 2"/></svg>'
    GameToolbar.styleButton(button)
    const panel = document.createElement('div')
    panel.hidden = true
    panel.style.cssText =
      'position:absolute;right:54px;bottom:0;width:220px;padding:12px;border:1px solid #395e79;border-radius:10px;background:#142735;color:#c6e6ff;font:14px system-ui'
    const label = document.createElement('label')
    const output = document.createElement('span')
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(cameraFovRange.min)
    input.max = String(cameraFovRange.max)
    input.step = '1'
    input.style.width = '100%'
    input.setAttribute('aria-label', 'Ajuste del campo de visión en grados')
    const refresh = () => {
      input.value = String(read())
      output.textContent = 'FOV · ajuste ' + (read() >= 0 ? '+' : '') + read() + '°'
    }
    label.append(output, input)
    const reset = document.createElement('button')
    reset.type = 'button'
    reset.textContent = 'Restablecer'
    const options = { signal: this.lifetime.signal }
    const change = (value: number) => {
      write(value)
      refresh()
    }
    input.addEventListener('input', () => change(Number(input.value)), options)
    reset.addEventListener('click', () => change(cameraFovDefault), options)
    button.addEventListener(
      'click',
      () => {
        panel.hidden = !panel.hidden
        button.setAttribute('aria-expanded', String(!panel.hidden))
        refresh()
        if (!panel.hidden) document.exitPointerLock?.()
      },
      options,
    )
    for (const event of ['pointerdown', 'click', 'keydown', 'keyup', 'wheel'])
      panel.addEventListener(event, (e) => e.stopPropagation(), options)
    button.addEventListener('pointerdown', (e) => e.stopPropagation(), options)
    panel.append(label, reset)
    group.append(button, panel)
    this.root.append(group)
    host.append(this.root)
  }
  addAction(label: string, icon: string, order: number, action: () => Promise<void>): void {
    const button = document.createElement('button')
    button.type = 'button'
    button.title = label
    button.setAttribute('aria-label', label)
    button.innerHTML = icon
    GameToolbar.styleButton(button)
    button.style.order = String(order)
    button.addEventListener('pointerdown', (e) => e.stopPropagation(), {
      signal: this.lifetime.signal,
    })
    button.addEventListener(
      'click',
      async (e) => {
        e.stopPropagation()
        if (button.disabled) return
        button.disabled = true
        button.setAttribute('aria-busy', 'true')
        try {
          await action()
        } finally {
          button.disabled = false
          button.removeAttribute('aria-busy')
        }
      },
      { signal: this.lifetime.signal },
    )
    this.root.append(button)
  }
  mount(group: HTMLElement, order: number): void {
    group.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:8px;order:' + order
    this.root.append(group)
    group.querySelectorAll('button').forEach((button) => GameToolbar.styleButton(button))
  }
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none'
  }
  dispose(): void {
    this.lifetime.abort()
    this.root.remove()
  }
}
