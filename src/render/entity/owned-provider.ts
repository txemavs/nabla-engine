/** Last registered provider wins; removing any owner never revives an already released one. */
export class OwnedProvider<T> {
  private registrations: { value: T }[] = []
  constructor(private fallback: T) {}
  get value(): T {
    return this.registrations.at(-1)?.value ?? this.fallback
  }
  /** An explicit legacy setter replaces all previous providers, as it always did. */
  set(value: T): void {
    this.fallback = value
    this.registrations = []
  }
  register(value: T): () => void {
    const entry = { value }
    this.registrations.push(entry)
    return () => {
      const index = this.registrations.indexOf(entry)
      if (index !== -1) this.registrations.splice(index, 1)
    }
  }
}
