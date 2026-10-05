import { z } from 'zod'
import { vector } from '../../entity/coords.js'
import { readWeaponPresetSources } from './weapon-source.js'

/**
 * A weapon preset is a JSON file under assets/library/weapons or assets/custom/weapons.
 * studio is published. custom is this machine only. The file is one firearm.
 * Hitscan, the reticle and the viewmodel belong to the shared Engine runtime.
 */
const presetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    name: z.string().min(1).max(80),
    order: z.number().int().min(0).max(100),
    body: z.string().min(1).max(200),
    slide: z.string().min(1).max(200).optional(),
    scale: z.number().finite().positive().max(10),
    assembly: vector,
    slideTravel: z.number().finite().min(0).max(500),
    intervalMs: z.number().finite().min(20).max(5000),
    range: z.number().finite().min(1).max(1000),
    impulse: z.number().finite().min(0).max(50),
    view: z
      .object({
        position: vector,
        kick: z.number().finite().min(0).max(1),
        pitch: z.number().finite().min(0).max(1),
      })
      .strict(),
    flash: z.object({ position: vector }).strict(),
  })
  .strict()

export type WeaponPreset = z.infer<typeof presetSchema>

let cached: WeaponPreset[] | undefined

/** Every preset found at startup, in menu order. An empty weapons folder yields none. */
export function weaponPresets(): WeaponPreset[] {
  if (cached) return cached
  const presets: WeaponPreset[] = []
  for (const source of readWeaponPresetSources()) {
    try {
      presets.push(presetSchema.parse(source.data))
    } catch (error) {
      throw new Error(`Weapon preset ${source.file} is invalid`, { cause: error })
    }
  }
  presets.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  const seen = new Set<string>()
  for (const preset of presets) {
    if (seen.has(preset.id)) throw new Error(`Duplicate weapon preset id ${preset.id}`)
    seen.add(preset.id)
  }
  return (cached = presets)
}

export function hasWeaponPreset(id: string): boolean {
  return weaponPresets().some((preset) => preset.id === id)
}

export function weaponPreset(id: string): WeaponPreset {
  const preset = weaponPresets().find((entry) => entry.id === id)
  if (!preset) throw new Error(`No weapon preset "${id}"`)
  return preset
}
