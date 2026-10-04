/** Keyboard state with a bounded lifetime for a lost keyup (embedded browsers/focus changes). */
export class HeldKeys {
  readonly values = new Set<string>()
  private readonly seen = new Map<string, number>()
  private lastActivity = 0
  /** Record a physical KeyboardEvent.code at a millisecond timestamp; ignore orphan repeats. */
  press(code: string, repeat: boolean, now: number): void {
    // Queued repeats after focus loss must not restart a released control.
    if (repeat && !this.values.has(code)) return
    this.values.add(code)
    this.seen.set(code, now)
    this.lastActivity = now
  }
  /** Release one key from both the exposed chord and its expiry tracking. */
  release(code: string): void {
    this.values.delete(code)
    this.seen.delete(code)
  }
  /** Release the complete chord after blur, pause or other loss of input ownership. */
  clear(): void {
    this.values.clear()
    this.seen.clear()
  }
  /** Release movement keys after 1500 ms of chord inactivity, recovering from lost keyup events. */
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
