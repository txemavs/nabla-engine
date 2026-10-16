/** Short X toggles on release; a two-second hold recalls once without toggling afterward. */
export class XRMenuGesture {
  private started: number | null = null
  private recalled = false
  reset(): void {
    this.started = null
    this.recalled = false
  }
  update(pressed: boolean, time: number): 'toggle' | 'recall' | null {
    if (!Number.isFinite(time)) {
      this.reset()
      return null
    }
    if (pressed) {
      if (this.started === null) this.started = time
      if (!this.recalled && time - this.started >= 2000) {
        this.recalled = true
        return 'recall'
      }
    } else if (this.started !== null) {
      const toggle = !this.recalled
      this.reset()
      return toggle ? 'toggle' : null
    }
    return null
  }
}
