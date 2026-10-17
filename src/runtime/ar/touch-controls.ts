import { TouchDriving } from '../touch-driving.js'
import { TouchFlight } from '../touch-flight.js'

/** Actions supplied by the controlled Engine object, independent of its presentation. */
export interface ARTouchAction {
  id: string
  label: string
  icon: string
  run: () => void
}

/** Existing Engine touch rigs, displayed only in screen-based XR sessions with DOM overlay. */
export class ARTouchControls {
  readonly root = document.createElement('div')
  readonly driving: TouchDriving
  readonly flight: TouchFlight
  private readonly actionBar = document.createElement('div')
  private actionKey = ''
  mobile = false
  available = false
  constructor(actions: { menu: () => void; arm: () => void; engage: () => void }) {
    this.root.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:transparent'
    this.root.hidden = true
    this.root.id = 'nabla-ar-touch'
    const style = document.createElement('style')
    style.textContent = `
#nabla-ar-touch[hidden],#nabla-ar-touch [hidden]{display:none!important}
#nabla-ar-touch { --ar-size:1.8; }
#nabla-ar-touch .touch-driving,#nabla-ar-touch .touch-flight {
 inset:auto max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));
 width:auto; }
#nabla-ar-touch .touch-driving-chrome { margin:0; }
#nabla-ar-touch .touch-driving-stack { display:grid; grid-template-columns:56px 48px;
 grid-template-rows:78px 54px; gap:8px; align-items:center; zoom:var(--ar-size); }
#nabla-ar-touch .touch-driving-gas { grid-column:2; grid-row:1 / 3; }
#nabla-ar-touch .touch-driving-wheel { zoom:var(--ar-size); margin-bottom:36px; }
#nabla-ar-touch .touch-driving-rim { box-sizing:border-box; }
#nabla-ar-touch .touch-driving-place,#nabla-ar-touch .touch-driving-bar { display:none; }
#nabla-ar-touch .touch-flight-col { zoom:var(--ar-size); margin-bottom:36px; }
#nabla-ar-touch .touch-flight-bar { display:none; }
#nabla-ar-touch .ar-object-actions { position:absolute; right:max(12px,env(safe-area-inset-right));
 bottom:max(12px,env(safe-area-inset-bottom)); display:flex; gap:8px; pointer-events:auto; }
#nabla-ar-touch .ar-object-actions button { width:56px;height:56px;border:1px solid #555;
 border-radius:2px;background:#252525;color:white;touch-action:none; }
#nabla-ar-touch .ar-object-actions svg { width:32px;height:32px; }
@media (max-height:340px),(orientation:portrait) { #nabla-ar-touch { --ar-size:1.4; } }
`
    this.root.append(style)
    document.body.append(this.root)
    const menu = document.createElement('button')
    menu.textContent = 'Menú'
    menu.style.cssText =
      'position:absolute;top:12px;left:12px;pointer-events:auto;min-width:64px;min-height:56px;font-size:20px;padding:12px;background:#252525;color:white;border:1px solid #555'
    menu.onclick = actions.menu
    this.root.append(menu)
    this.actionBar.className = 'ar-object-actions'
    this.root.append(this.actionBar)
    this.driving = new TouchDriving(
      this.root,
      { interact: actions.menu, camera: actions.menu, engage: actions.engage },
      'always',
    )
    this.flight = new TouchFlight(
      this.root,
      { play: actions.arm, interact: actions.menu, camera: actions.menu, engage: actions.engage },
      'always',
    )
    // AR has no seated camera/enter action: use one explicit menu button instead.
    this.root
      .querySelectorAll<HTMLElement>(
        '[data-flight="interact"],[data-flight="camera"],[data-drive="interact"],[data-drive="camera"]',
      )
      .forEach((button) => {
        button.hidden = true
      })
    const arm = this.root.querySelector<HTMLElement>('[data-flight="play"]')
    if (arm) {
      arm.title = 'Armar / desarmar motores'
      arm.setAttribute('aria-label', arm.title)
    }
    this.root.addEventListener('beforexrselect', (event) => {
      if ((event.target as HTMLElement).closest('button,[data-drive],.touch-flight-col'))
        event.preventDefault()
    })
    this.update(null, null, true)
  }
  /** Rebuild only when the controlled object changes; never allocate buttons per frame. */
  setActions(key: string, actions: readonly ARTouchAction[]): void {
    if (key === this.actionKey) return
    this.actionKey = key
    this.actionBar.replaceChildren()
    for (const action of actions) {
      const button = document.createElement('button')
      button.type = 'button'
      button.title = action.label
      button.setAttribute('aria-label', action.label)
      button.dataset.action = action.id
      button.innerHTML = action.icon
      button.onclick = () => action.run()
      this.actionBar.append(button)
    }
  }
  update(session: XRSession | null, kind: 'road' | 'flight' | null, blocked: boolean): void {
    this.mobile =
      !!session &&
      (session.interactionMode === 'screen-space' ||
        Array.from(session.inputSources).some((source) => source.targetRayMode === 'screen'))
    this.available =
      this.mobile &&
      !!(session as (XRSession & { domOverlayState?: unknown }) | null)?.domOverlayState
    const active = this.available && session?.visibilityState === 'visible'
    this.root.hidden = !active
    this.actionBar.hidden = !active || blocked || !kind
    const road = active && !blocked && kind === 'road'
    const flight = active && !blocked && kind === 'flight'
    this.driving.root.hidden = !road
    this.driving.setActive(road)
    this.driving.setDriving(road)
    this.flight.setActive(flight)
  }
  dispose(): void {
    this.driving.dispose()
    this.flight.dispose()
    this.root.remove()
  }
}
