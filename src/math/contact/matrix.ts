import type { Body } from '../../simulation/physics.js'

/** Identity-keyed contacts. Rapier does not use Cannon's dense matrix; this remains for the old tests. */
export class SparseContactMatrix {
  readonly matrix: number[] = []
  private readonly contacts = new Map<Body, Map<Body, boolean>>()
  get(a: Body, b: Body): number {
    return Number(this.contacts.get(a)?.get(b) || this.contacts.get(b)?.get(a) || false)
  }
  set(a: Body, b: Body, value: boolean): void {
    let row = this.contacts.get(a)
    if (!row) this.contacts.set(a, (row = new Map()))
    row.set(b, value)
    this.contacts.get(b)?.delete(a)
  }
  reset(): void {
    this.contacts.clear()
  }
  setNumObjects(_count: number): void {}
}
