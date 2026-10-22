import { installEngineStyles } from '../../ui/styles.js'
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
    this.root.hidden = true
    this.root.id = 'nabla-ar-touch'
    installEngineStyles(document)
    document.body.append(this.root)
    const menu = document.createElement('button')
    menu.textContent = 'Menú'
    menu.className = 'nabla-ar-menu'
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
