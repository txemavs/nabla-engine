import { weaponPresets, type WeaponPreset } from './library.js'
import { heldWeaponPresets, type HeldWeaponPreset } from './held-library.js'

export type WeaponSlot =
  | { slot: number; kind: 'firearm'; id: string; name: string; preset: WeaponPreset }
  | {
      slot: number
      kind: HeldWeaponPreset['kind']
      id: string
      name: string
      preset: HeldWeaponPreset
    }

/**
 * Number-key loadout built from preset data: every preset with a `slot`, one per key
 * (the first by order wins). Without any slotted preset there are no slots.
 */
export function buildWeaponSlots(
  firearms: readonly WeaponPreset[],
  held: readonly HeldWeaponPreset[],
): WeaponSlot[] {
  const all: WeaponSlot[] = [
    ...firearms
      .filter((preset) => preset.slot !== undefined)
      .map((preset) => ({
        slot: preset.slot!,
        kind: 'firearm' as const,
        id: preset.id,
        name: preset.name,
        preset,
      })),
    ...held.map((preset) => ({
      slot: preset.slot,
      kind: preset.kind,
      id: preset.id,
      name: preset.name,
      preset,
    })),
  ]
  const bySlot = new Map<number, WeaponSlot>()
  for (const entry of all) if (!bySlot.has(entry.slot)) bySlot.set(entry.slot, entry)
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot)
}

let cached: WeaponSlot[] | undefined
export function weaponSlots(): WeaponSlot[] {
  return (cached ??= buildWeaponSlots(weaponPresets(), heldWeaponPresets()))
}
