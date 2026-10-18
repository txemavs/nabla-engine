import { cameraFovRange } from './camera-fov.js'

/** Shared layout, icon appearance and ordered groups for the gameplay action rail. */
export class GameToolbar {
  readonly root = document.createElement('div')
  private readonly lifetime = new AbortController()
  static styleButton(button: HTMLButtonElement): void {
    button.style.cssText =
      'width:44px;height:44px;flex:none;display:grid;place-items:center;padding:0;border:2px solid #395e79;border-radius:12px;background:#142735;color:#c6e6ff;touch-action:none;cursor:pointer'
  }
  constructor(
    host: HTMLElement,
    read: () => number,
    write: (value: number) => void,
    resolution?: { read: () => number; write: (value: number) => void },
  ) {
    if (!document.getElementById('nabla-vertical-sliders')) {
      const style = document.createElement('style')
      style.id = 'nabla-vertical-sliders'
      style.textContent = `.nabla-vertical-range { appearance:none;writing-mode:vertical-lr;direction:rtl;width:40px;height:160px;background:transparent;touch-action:none;cursor:pointer; }
.nabla-vertical-range::-webkit-slider-runnable-track { width:4px;background:#4448;border-radius:2px; }
.nabla-vertical-range::-webkit-slider-thumb { appearance:none;width:40px;height:40px;margin-left:-18px;background:var(--button,#252525);border:1px solid var(--line,#555);border-radius:2px; }
.nabla-vertical-range::-moz-range-track { width:4px;background:#4448; }
.nabla-vertical-range::-moz-range-thumb { width:38px;height:38px;background:#252525;border:1px solid #555;border-radius:2px; }
.nabla-slider-well { position:relative;width:40px;margin:8px auto; }
.nabla-slider-notch { position:absolute;left:-5px;width:50px;height:2px;background:#aaa;pointer-events:none; }
.nabla-slider-panel { text-align:center;min-width:64px; }
.nabla-slider-panel label { display:flex;align-items:center;flex-direction:column;gap:6px; }`
      document.head.append(style)
    }
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
    button.dataset.toolbarLabel = 'FOV'
    button.title = 'Campo de visión (FOV)'
    button.setAttribute('aria-label', button.title)
    button.setAttribute('aria-expanded', 'false')
    button.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4H3v6m12-6h6v6M3 14v6h6m6 0h6v-6M8 12h8m-6-2-2 2 2 2m4-4 2 2-2 2"/></svg>'
    GameToolbar.styleButton(button)
    const panel = document.createElement('div')
    panel.hidden = true
    panel.style.cssText =
      'position:absolute;right:54px;bottom:0;width:76px;padding:8px;border:1px solid #395e79;border-radius:10px;background:#142735;color:#c6e6ff;font:14px system-ui'
    const label = document.createElement('label')
    const output = document.createElement('span')
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(cameraFovRange.min)
    input.max = String(cameraFovRange.max)
    input.step = '1'
    input.className = 'nabla-vertical-range'
    panel.className = 'nabla-slider-panel'
    input.setAttribute('aria-label', 'Ajuste del campo de visión en grados')
    const refresh = () => {
      input.value = String(read())
      output.textContent = String(read())
    }
    const well = document.createElement('div')
    well.className = 'nabla-slider-well'
    const notch = document.createElement('i')
    notch.className = 'nabla-slider-notch'
    notch.style.top =
      20 + (cameraFovRange.max / (cameraFovRange.max - cameraFovRange.min)) * 120 + 'px'
    well.append(notch, input)
    label.append(output, well)
    const options = { signal: this.lifetime.signal }
    const change = (value: number) => {
      write(value)
      refresh()
    }
    input.addEventListener('input', () => change(Number(input.value)), options)
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
    panel.append(label)
    group.append(button, panel)
    this.root.append(group)
    if (resolution) {
      const scales = [0.5, 1, 1.5, 2]
      const rg = document.createElement('div')
      rg.style.cssText = 'position:relative;order:31'
      const rb = document.createElement('button')
      rb.type = 'button'
      rb.dataset.toolbarLabel = 'QLTY'
      rb.textContent = '%'
      rb.title = 'Escala de resolución'
      rb.setAttribute('aria-label', rb.title)
      GameToolbar.styleButton(rb)
      const rp = document.createElement('div')
      rp.className = 'nabla-slider-panel'
      rp.hidden = true
      rp.style.cssText = panel.style.cssText
      const value = document.createElement('output')
      const ri = document.createElement('input')
      ri.type = 'range'
      ri.min = '0'
      ri.max = String(scales.length - 1)
      ri.step = '1'
      ri.className = 'nabla-vertical-range'
      ri.setAttribute('aria-label', 'Escala de resolución')
      const sync = () => {
        const current = resolution.read()
        ri.value = String(
          scales.reduce(
            (best, n, i) => (Math.abs(n - current) < Math.abs(scales[best] - current) ? i : best),
            0,
          ),
        )
        value.textContent = Math.round(current * 100) + '%'
        ri.setAttribute('aria-valuetext', value.textContent)
      }
      ri.addEventListener(
        'input',
        () => {
          resolution.write(scales[Number(ri.value)])
          sync()
        },
        options,
      )
      rb.addEventListener(
        'click',
        () => {
          rp.hidden = !rp.hidden
          rb.setAttribute('aria-expanded', String(!rp.hidden))
          sync()
          if (!rp.hidden) document.exitPointerLock?.()
        },
        options,
      )
      for (const event of ['pointerdown', 'click', 'keydown', 'keyup', 'wheel'])
        rp.addEventListener(event, (e) => e.stopPropagation(), options)
      const rl = document.createElement('label')
      rl.append(value, ri)
      rp.append(rl)
      rg.append(rb, rp)
      this.root.append(rg)
    }
    host.append(this.root)
  }
  addAction(
    label: string,
    icon: string,
    order: number,
    action: () => Promise<void>,
    shortLabel?: string,
  ): void {
    const button = document.createElement('button')
    button.type = 'button'
    if (shortLabel) button.dataset.toolbarLabel = shortLabel
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
