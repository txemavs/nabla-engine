import { t } from '../i18n/index.js'
import { controlsHint } from '../config/input-bindings.js'
import { MAGAZINE_ACTION } from '../character/body-slots.js'
import { GameToolbar } from './game-toolbar.js'
/** On-screen weapon controls, available with mouse and touch. */
export class WeaponControls {
  readonly root = document.createElement('div')
  aiming = false
  private readonly lifetime = new AbortController()
  constructor(
    host: HTMLElement,
    action: (code: string) => void,
    private readonly aim: (held: boolean) => void,
    toolbar?: GameToolbar,
  ) {
    this.root.className = 'weapon-controls nabla-btn-group nabla-btn-group--column'
    const options = { signal: this.lifetime.signal }
    const aiming = (held: boolean) => {
      this.aiming = held
      aim(held)
    }
    for (const [label, code] of [
      [t('toolbar.aim'), 'aim'],
      [controlsHint({ mode: 'walk', weapon: true }, [MAGAZINE_ACTION]), MAGAZINE_ACTION],
      [controlsHint({ mode: 'walk', weapon: true }, ['weapon.slide']), 'weapon.slide'],
    ]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.toolbarLabel =
        code === 'aim' ? 'AIM' : code === MAGAZINE_ACTION ? 'MAG' : 'SLIDE'
      button.title = label
      button.setAttribute('aria-label', label)
      const icon =
        code === 'aim'
          ? '<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>'
          : code === MAGAZINE_ACTION
            ? '<path d="M8 3h8v17H8zM10 7h4m-4 4h4m-4 4h4"/>'
            : '<path d="M4 8h16v7H4zM8 4L4 8l4 4m8 0l4 4-4 4"/>'
      button.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        icon +
        '</svg>'
      GameToolbar.styleButton(button)
      button.addEventListener(
        'pointerdown',
        (event) => {
          event.preventDefault()
          event.stopPropagation()
          button.setPointerCapture(event.pointerId)
          if (code === 'aim') aiming(true)
          else action(code)
        },
        options,
      )
      if (code === 'aim') {
        for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
          button.addEventListener(event, () => aiming(false), options)
      }
      button.addEventListener(
        'click',
        (event) => {
          if (event.detail === 0) {
            if (code === 'aim') aiming(!this.aiming)
            else action(code)
          }
        },
        options,
      )
      this.root.append(button)
    }
    if (toolbar) toolbar.mount(this.root, 20)
    else host.append(this.root)
    window.addEventListener('blur', () => aiming(false), options)
    this.setActive(false)
  }
  setActive(active: boolean): void {
    this.root.hidden = !active
    if (!active && this.aiming) {
      this.aiming = false
      this.aim(false)
    }
  }
  dispose(): void {
    this.lifetime.abort()
    this.root.remove()
  }
}
