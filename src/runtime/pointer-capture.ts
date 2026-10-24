interface PointerTarget {
  requestPointerLock?: () => void | Promise<void>
}
interface PointerDocument {
  readonly pointerLockElement: unknown
  exitPointerLock(): void
}

/** One runtime's pointer policy; input handlers own gestures and listener lifetime. */
export class RuntimePointerCapture {
  free = false

  constructor(
    private readonly target: PointerTarget,
    private readonly document: PointerDocument,
    private readonly playing: () => boolean,
  ) {}

  get locked(): boolean {
    return this.document.pointerLockElement === this.target
  }

  get unsupported(): boolean {
    return typeof this.target.requestPointerLock !== 'function'
  }

  /** Only call from a gesture handler. Refusal is harmless; a later click can retry. */
  capture(): void {
    if (!this.playing() || this.locked || this.unsupported) return
    this.free = false
    try {
      const request = this.target.requestPointerLock!()
      if (request && typeof request.catch === 'function') request.catch(() => undefined)
    } catch {
      // Older/embedded browsers can reject synchronously.
    }
  }

  release(): void {
    if (this.locked) this.document.exitPointerLock()
  }

  changed(releaseInput: () => void): void {
    if (this.locked) {
      this.free = false
      return
    }
    if (this.playing()) this.free = true
    releaseInput()
  }
}
