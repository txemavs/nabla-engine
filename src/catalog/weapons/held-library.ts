import { z } from 'zod'
import { vector } from '../../entity/coords.js'
import { readWeaponPresetSources } from './weapon-source.js'

/**
 * Non-firearm weapons share the weapons folder with firearm presets and are told apart by
 * `kind`. Everything specific to one weapon (model, hold pose, reach) is data in its JSON;
 * the runtime only knows the three kinds.
 * - `melee`: held model; fire swings it and hits the first body within `melee.reachM`.
 * - `bow`: held model only on foot for now; the headset uses the physical XR bow.
 * - `prop`: held model only (for example a long gun before its firearm data exists).
 * - `placeholder`: reserves a slot (name shown, nothing equipped).
 */
const finite = z.number().finite()
const pose = z
  .object({
    /** Metres, in the eye frame (first person) or the avatar frame (third person). */
    position: vector,
    /** Euler XYZ, radians. */
    rotation: z.tuple([finite, finite, finite]),
  })
  .strict()
const heldSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    name: z.string().min(1).max(80),
    kind: z.enum(['melee', 'bow', 'prop', 'placeholder']),
    slot: z.number().int().min(1).max(9),
    order: z.number().int().min(0).max(100).default(50),
    model: z.string().min(1).max(200).optional(),
    /** Use only this named node of `model` (for example the bow without its arrow). */
    node: z.string().min(1).max(120).optional(),
    /** Base damage of one hit on a character (× hit-zone multiplier, docs/combat.md). */
    damage: z.number().finite().min(0).max(1000).optional(),
    scale: z.number().finite().positive().max(10).default(1),
    /** Bow binding id (engine bowModels, e.g. `recurve-bow`): the same bow and string cut as
     * the headset bow; replaces `model`, `node` and `scale`. */
    bowModel: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .optional(),
    view: pose.optional(),
    world: pose.optional(),
    melee: z
      .object({
        reachM: z.number().finite().positive().max(5),
        impulse: z.number().finite().min(0).max(50),
        swingMs: z.number().finite().min(50).max(3000),
        /** Swing rotation added at the peak, Euler XYZ radians. */
        arc: z.tuple([finite, finite, finite]),
      })
      .strict()
      .optional(),
    sources: z.record(z.string(), z.string().min(1).max(600)).optional(),
  })
  .strict()
  .refine(
    (preset) => preset.kind === 'placeholder' || ((preset.model || preset.bowModel) && preset.view),
    {
      message: 'melee and bow presets need model (or bowModel) and view',
    },
  )
  .refine((preset) => preset.bowModel === undefined || preset.kind === 'bow', {
    message: 'bowModel is for bow presets',
  })
  .refine((preset) => preset.kind !== 'melee' || preset.melee, {
    message: 'melee presets need melee',
  })

export type HeldWeaponPreset = z.infer<typeof heldSchema>

export function isHeldWeaponSource(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'kind' in data
}

let cached: HeldWeaponPreset[] | undefined

/** Melee, bow and placeholder presets found at startup. */
export function heldWeaponPresets(): HeldWeaponPreset[] {
  if (cached) return cached
  const presets: HeldWeaponPreset[] = []
  for (const source of readWeaponPresetSources()) {
    if (!isHeldWeaponSource(source.data)) continue
    try {
      presets.push(heldSchema.parse(source.data))
    } catch (error) {
      throw new Error(`Weapon preset ${source.file} is invalid`, { cause: error })
    }
  }
  presets.sort((a, b) => a.slot - b.slot || a.order - b.order || a.id.localeCompare(b.id))
  return (cached = presets)
}

/** Parse one held preset; for tests and hosts that build presets in code. */
export function parseHeldWeaponPreset(data: unknown): HeldWeaponPreset {
  return heldSchema.parse(data)
}
