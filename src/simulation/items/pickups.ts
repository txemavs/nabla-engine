import type { Vec3Tuple } from '../../entity/schema.js'

/** Host-authored world item; inventory and collection do not depend on its model. */
export interface WorldPickup {
  id: string
  itemId: string
  name: string
  position: Vec3Tuple
}

/** Session inventory: empty at start; collection is atomic and requires physical reach. */
export class PickupInventory {
  private readonly loose = new Map<string, WorldPickup>()
  private readonly owned = new Set<string>()
  add(pickup: WorldPickup): void {
    if (this.loose.has(pickup.id)) throw new Error(`Duplicate pickup: ${pickup.id}`)
    this.loose.set(pickup.id, { ...pickup, position: [...pickup.position] })
  }
  has(itemId: string): boolean {
    return this.owned.has(itemId)
  }
  get items(): readonly WorldPickup[] {
    return [...this.loose.values()]
  }
  nearest(
    position: Vec3Tuple,
    reach = 1.8,
    visible: (item: WorldPickup) => boolean = () => true,
  ): WorldPickup | null {
    let nearest: WorldPickup | null = null,
      distance = reach
    for (const item of this.loose.values()) {
      const d = Math.hypot(...item.position.map((value, i) => value - position[i]))
      if (d <= distance && visible(item)) {
        nearest = item
        distance = d
      }
    }
    return nearest
  }
  take(
    id: string,
    position: Vec3Tuple,
    visible: (item: WorldPickup) => boolean = () => true,
  ): WorldPickup | null {
    const item = this.loose.get(id)
    if (
      !item ||
      Math.hypot(...item.position.map((value, i) => value - position[i])) > 1.8 ||
      !visible(item)
    )
      return null
    this.loose.delete(id)
    this.owned.add(item.itemId)
    return item
  }
  clear(): void {
    this.loose.clear()
    this.owned.clear()
  }
}
