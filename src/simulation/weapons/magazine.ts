/** A magazine is an item, not an ammunition counter owned by the weapon. */
export interface MagazineEntity {
  readonly id: string
  readonly capacity: number
  rounds: number
}

let serial = 0
export function createMagazine(capacity: number, rounds = capacity): MagazineEntity {
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Magazine capacity')
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > capacity)
    throw new RangeError('Magazine rounds')
  return { id: `magazine-${++serial}`, capacity, rounds }
}
