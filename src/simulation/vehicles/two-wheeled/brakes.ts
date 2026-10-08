/**
 * Pure two-wheeler brake distribution: independent front lever / rear pedal, or a combined
 * (Dual CBS style) system where each control feeds both wheels. Brake levels are shares of
 * each wheel's full brake force, 0..1. See `twoWheeledDefaults.cbs` for the placeholder
 * shares; they are TODO(unverified), not manufacturer data.
 */
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export interface CombinedBrakeSplit {
  /** Share of the front brake the lever applies. */
  leverFront: number
  /** Share of the rear brake the lever applies (through a linked circuit). */
  leverRear: number
  /** Share of the front brake the pedal applies (through a linked circuit). */
  pedalFront: number
  /** Share of the rear brake the pedal applies. */
  pedalRear: number
  /** First-order lag of the linked circuits, seconds (0 = instant). */
  linkLag: number
}

/** Phase-1 behaviour: the lever only brakes the front, the pedal only the rear. */
export const independentBrakes: Readonly<CombinedBrakeSplit> = Object.freeze({
  leverFront: 1,
  leverRear: 0,
  pedalFront: 0,
  pedalRear: 1,
  linkLag: 0,
})

export interface BrakeLinkState {
  /** Filtered linked contribution to the rear brake (from the lever), 0..1. */
  linkedRear: number
  /** Filtered linked contribution to the front brake (from the pedal), 0..1. */
  linkedFront: number
}

export function validBrakeSplit(split: CombinedBrakeSplit): boolean {
  const shares = [split.leverFront, split.leverRear, split.pedalFront, split.pedalRear]
  return (
    shares.every((share) => Number.isFinite(share) && share >= 0 && share <= 1) &&
    Number.isFinite(split.linkLag) &&
    split.linkLag >= 0 &&
    split.leverFront + split.leverRear > 0 &&
    split.pedalFront + split.pedalRear > 0
  )
}

/**
 * Steady-state brake levels for lever and pedal inputs (0..1): each wheel sums its direct and
 * linked shares, capped at its full force.
 */
export function combinedBrakeLevels(
  lever: number,
  pedal: number,
  split: CombinedBrakeSplit,
): { front: number; rear: number } {
  const l = clamp01(lever),
    p = clamp01(pedal)
  return {
    front: clamp01(l * split.leverFront + p * split.pedalFront),
    rear: clamp01(l * split.leverRear + p * split.pedalRear),
  }
}

/**
 * One tick of the combined brakes with the linked circuits lagging by `split.linkLag`: the
 * direct shares act at once, the cross-coupled ones build up (and release) first-order.
 */
export function stepCombinedBrakes(
  state: BrakeLinkState,
  lever: number,
  pedal: number,
  split: CombinedBrakeSplit,
  dt: number,
): { front: number; rear: number } {
  const l = clamp01(lever),
    p = clamp01(pedal)
  const blend = split.linkLag > 0 ? 1 - Math.exp(-Math.max(0, dt) / split.linkLag) : 1
  state.linkedRear += (l * split.leverRear - state.linkedRear) * blend
  state.linkedFront += (p * split.pedalFront - state.linkedFront) * blend
  return {
    front: clamp01(l * split.leverFront + state.linkedFront),
    rear: clamp01(p * split.pedalRear + state.linkedRear),
  }
}
