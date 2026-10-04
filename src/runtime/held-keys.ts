/** Keyboard state with a bounded lifetime for a lost keyup (embedded browsers/focus changes). */
export class HeldKeys {
  readonly values = new Set<string>()
  private readonly seen = new Map<string, number>()
  private lastActivity = 0
  press(code: string, repeat: boolean, now: number): void {
    // Queued repeats after focus loss must not restart a released control.
    if (repeat && !this.values.has(code)) return
    this.values.add(code)
    this.seen.set(code, now)
    this.lastActivity = now
  }
  release(code: string): void {
    this.values.delete(code)
    this.seen.delete(code)
  }
  clear(): void {
    this.values.clear()
    this.seen.clear()
  }
  expire(now: number): void {
    // Operating systems repeat only the most recently pressed key. Renew the
    // whole chord so holding W+D does not accidentally release W.
    for (const code of this.seen.keys()) {
      if (
        /^(Key[WASD]|Arrow(Up|Down|Left|Right)|Space)$/.test(code) &&
        now - this.lastActivity > 1500
      )
        this.release(code)
    }
  }
}
