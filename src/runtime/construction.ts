/** Resources acquired during construction remain provisional until the constructor commits. */
export class RuntimeConstruction {
  private releases: (() => void)[] = []
  defer(release: () => void): void {
    this.releases.push(release)
  }
  commit(): void {
    this.releases.length = 0
  }
  /** Release every acquired owner in reverse order; callers preserve the construction error. */
  rollback(): void {
    const releases = this.releases.splice(0).reverse()
    for (const release of releases) {
      try {
        release()
      } catch {
        /* A failed release must not strand the remaining owners. */
      }
    }
  }
}
