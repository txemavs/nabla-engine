/** Keyboard state with a bounded lifetime for a lost keyup (embedded browsers/focus changes). */
export class HeldKeys {
  readonly values = new Set<string>()
  private readonly seen = new Map<string, number>()
  /**
   * The key whose repeat stream the operating system is producing: the most recently pressed
   * key that is still down. Only its silence proves a lost keyup; an older key stays quiet
   * for as long as it is held, so its silence proves nothing.
   */
  private owner: string | null = null
  private lastActivity = 0
  /** Times the lost-keyup recovery released the held chord, for diagnostics. */
  expirations = 0
  /** Record a physical KeyboardEvent.code at a millisecond timestamp; ignore orphan repeats. */
  press(code: string, repeat: boolean, now: number): void {
    // Queued repeats after focus loss must not restart a released control.
    if (repeat && !this.values.has(code)) return
    this.values.add(code)
    this.seen.set(code, now)
    this.owner = code
    this.lastActivity = now
  }
  /** Release one key from both the exposed chord and its expiry tracking. */
  release(code: string): void {
    this.values.delete(code)
    this.seen.delete(code)
    // Windows and macOS do not hand the repeat stream back to an older key that is still
    // down, so with no owner there is no silence to interpret and the chord is kept.
    if (this.owner === code) this.owner = null
  }
  /** Release the complete chord after blur, pause or other loss of input ownership. */
  clear(): void {
    this.values.clear()
    this.seen.clear()
    this.owner = null
  }
  /**
   * Release movement keys after 1500 ms without a keydown or repeat from the newest held key,
   * recovering from a lost keyup. A key held while another key was tapped and released keeps
   * silently counting as held: throttle must not drop because steering was tapped.
   */
  expire(now: number): void {
    if (this.owner === null || now - this.lastActivity <= 1500) return
    const lost = [...this.seen.keys()].filter((code) =>
      /^(Key[WASD]|Arrow(Up|Down|Left|Right)|Space)$/.test(code),
    )
    for (const code of lost) this.release(code)
    if (lost.length) this.expirations++
    // Whatever remains (non-movement keys) is no longer a verifiable repeat stream.
    this.owner = null
  }
}
