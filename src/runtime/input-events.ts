import type { RuntimePointerCapture } from './pointer-capture.js'

export interface RuntimeInputHooks {
  playing(): boolean
  hasInput(): boolean
  activity(): void
  syncShift(held: boolean): void
  unlockAudio(): void
  monitorAtCenter(): boolean
  button(button: number, down: boolean): void
  cancelPointer(): void
  wheel(event: WheelEvent): void
  keyDown(event: KeyboardEvent): void
  keyUp(event: KeyboardEvent): void
  move(event: PointerEvent): void
  visibility(hidden: boolean): void
  release: {
    beam(): void
    controllers(): void
    weapons(): void
    touch(): void
    monitors(): void
    game(): void
    gamepad(): void
  }
}

/** DOM input/focus lifecycle. Game action execution is supplied through narrow callbacks. */
export class RuntimeInputEvents {
  private bound = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly window: Window,
    private readonly document: Document,
    private readonly pointer: RuntimePointerCapture,
    private readonly hooks: RuntimeInputHooks,
    private readonly signal: AbortSignal,
  ) {}

  /** Bind once; the runtime lifetime signal removes all listeners together. */
  bind(): void {
    if (this.bound || this.signal.aborted) return
    this.bound = true
    const { canvas, window, document, pointer, hooks } = this
    const options = { signal: this.signal }
    for (const event of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'wheel'])
      window.addEventListener(event, () => hooks.activity(), { ...options, capture: true })
    // Resync Shift after blur or pointer recapture so a held sprint key resumes immediately.
    for (const event of [
      'pointerdown',
      'pointerup',
      'pointermove',
      'mousedown',
      'mouseup',
    ] as const)
      canvas.addEventListener(
        event,
        (e) => {
          if (hooks.hasInput() && hooks.playing()) hooks.syncShift(e.shiftKey)
        },
        options,
      )
    canvas.addEventListener('wheel', (event) => hooks.wheel(event), { ...options, passive: false })
    canvas.parentElement!.addEventListener(
      'pointerdown',
      (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.portal-tablet-layer button')
        ) {
          event.preventDefault()
          canvas.focus()
          hooks.unlockAudio()
        }
        if (event.target === canvas.parentElement) {
          event.preventDefault()
          canvas.focus()
          hooks.unlockAudio()
          if (event.pointerType === 'mouse') pointer.capture()
        }
      },
      options,
    )
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        canvas.focus()
        hooks.unlockAudio()
        if (event.pointerType === 'mouse' && hooks.playing()) {
          if (pointer.locked) {
            if (event.button === 0 && hooks.monitorAtCenter()) {
              event.preventDefault()
              pointer.release()
              return
            }
          } else if (!pointer.unsupported) {
            // The recapture click must not also fire the weapon.
            event.preventDefault()
            pointer.capture()
            return
          }
        }
        hooks.button(event.button, true)
      },
      options,
    )
    canvas.addEventListener('pointerup', (event) => hooks.button(event.button, false), options)
    // Mouse events deliver secondary button changes while another button is held.
    canvas.addEventListener('mousedown', (event) => hooks.button(event.button, true), options)
    canvas.addEventListener('mouseup', (event) => hooks.button(event.button, false), options)
    canvas.addEventListener('pointercancel', () => hooks.cancelPointer(), options)
    canvas.addEventListener(
      'contextmenu',
      (event) => {
        if (hooks.playing()) event.preventDefault()
      },
      options,
    )
    canvas.addEventListener('keydown', (event) => hooks.keyDown(event), options)
    window.addEventListener('keyup', (event) => hooks.keyUp(event), { ...options, capture: true })
    window.addEventListener('pagehide', () => this.release(), options)
    document.addEventListener(
      'pointerlockchange',
      () => pointer.changed(() => this.release()),
      options,
    )
    canvas.addEventListener('blur', () => this.release(), options)
    window.addEventListener('blur', () => this.release(), options)
    document.addEventListener(
      'visibilitychange',
      () => {
        this.release()
        hooks.visibility(document.hidden)
      },
      options,
    )
    canvas.addEventListener('pointermove', (event) => hooks.move(event), options)
  }

  /** Preserve release order: transient controls first, pointer ownership last. */
  release(): void {
    const release = this.hooks.release
    release.beam()
    release.controllers()
    release.weapons()
    release.touch()
    release.monitors()
    release.game()
    release.gamepad()
    this.pointer.release()
  }
}
