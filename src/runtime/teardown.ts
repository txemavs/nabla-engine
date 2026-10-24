/** Ordered terminal cleanup. Each action runs at most once, including reentrant disposal. */
export class RuntimeTeardown {
  private closed = false
  constructor(private actions: readonly (() => void)[]) {}

  dispose(): void {
    if (this.closed) return
    this.closed = true
    const actions = this.actions
    this.actions = []
    const errors: unknown[] = []
    for (const release of actions) {
      try {
        release()
      } catch (error) {
        errors.push(error)
      }
    }
    // Keep the first failure's identity, but never strand later resources behind it.
    if (errors.length) throw errors[0]
  }
}
