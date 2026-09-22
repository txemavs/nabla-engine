import { ArrayCollisionMatrix, ObjectCollisionMatrix, type Body } from 'cannon-es'

/** Cannon's World types require ArrayCollisionMatrix, but its runtime only needs
 * get/set/reset/setNumObjects. Delegate to its sparse, stable-body-ID implementation
 * so a mostly static streamed world does not clear O(bodyCount²) slots every tick. */
export class SparseContactMatrix extends ArrayCollisionMatrix {
  private readonly contacts = new ObjectCollisionMatrix()
  override get(a: Body, b: Body): number {
    return Number(this.contacts.get(a, b))
  }
  override set(a: Body, b: Body, value: boolean): void {
    this.contacts.set(a, b, value)
  }
  override reset(): void {
    this.contacts.reset()
  }
  override setNumObjects(_count: number): void {
    // Sparse storage grows only when a contact is recorded.
  }
}
