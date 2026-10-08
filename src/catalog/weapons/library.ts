import { z } from 'zod'
import { vector } from '../../entity/coords.js'
import { readWeaponPresetSources } from './weapon-source.js'

/**
 * A weapon preset is a JSON file under assets/library/weapons or assets/custom/weapons.
 * studio is published. custom is this machine only. The file is one firearm.
 * Hitscan, the reticle and the viewmodel belong to the shared Engine runtime.
 */
const positive = z.number().finite().positive()
const firearmSchema = z
  .object({
    variant: z.string().min(1).max(120),
    caliber: z.string().min(1).max(40),
    magazineCapacity: z.number().int().min(1).max(100),
    chamber: z.number().int().min(0).max(1),
    barrelLengthM: positive.max(2),
    massEmptyMagKg: positive.max(20),
    magazineMassKg: positive.max(5),
    triggerPullSingleN: positive.max(200).optional(),
    triggerPullDoubleN: positive.max(200).optional(),
    semiAutomatic: z.literal(true),
    slideLocksOnEmpty: z.boolean(),
    cycleMs: positive.max(2000),
    reloadMs: z
      .object({
        magazineOut: positive.max(10000),
        magazineIn: positive.max(10000),
        slideRelease: positive.max(10000),
      })
      .strict()
      .refine((r) => r.magazineOut < r.magazineIn && r.magazineIn < r.slideRelease, {
        message: 'reload steps must be in order',
      }),
  })
  .strict()
const ammunitionSchema = z
  .object({
    load: z.string().min(1).max(120),
    bulletMassKg: positive.max(1),
    muzzleVelocityMs: positive.max(2000),
    testBarrelM: positive.max(2).optional(),
    ballisticCoefficientG1: positive.max(2).optional(),
    /** Published velocity at range (yards, ft/s), fitted to a drag constant. */
    velocityTable: z
      .array(
        z.object({ yards: z.number().finite().min(0).max(2000), fps: positive.max(6000) }).strict(),
      )
      .min(2)
      .max(20),
    zeroRangeM: positive.max(1000),
    sightHeightM: z.number().finite().min(0).max(0.2),
    effectiveRangeM: positive.max(5000).optional(),
    maxTraceM: positive.max(2000),
  })
  .strict()
const recoilSchema = z
  .object({
    riseDeg: z.number().finite().min(0).max(45),
    naturalReturn: z.number().finite().min(0).max(1),
    climbMs: positive.max(1000),
    returnMs: positive.max(5000),
  })
  .strict()
const casingSchema = z
  .object({
    lengthM: positive.max(0.2),
    rimDiameterM: positive.max(0.1),
    ejectSpeedMs: z.number().finite().min(0).max(30),
    restitution: z.number().finite().min(0).max(1),
    friction: z.number().finite().min(0).max(1),
    lifetimeS: positive.max(600),
  })
  .strict()

const presetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    name: z.string().min(1).max(80),
    order: z.number().int().min(0).max(100),
    /** Legacy split assets (body + optional slide), used when there is no assembled `model`. */
    body: z.string().min(1).max(200).optional(),
    slide: z.string().min(1).max(200).optional(),
    /** Assembled GLB with Frame / Slide / Trigger / Magazine nodes and a MuzzleSocket. */
    model: z.string().min(1).max(200).optional(),
    /** Presentation rig JSON (part and socket names, artistic travel) for `model`. */
    rig: z.string().min(1).max(200).optional(),
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
    /** Real-firearm data (`src/simulation/weapons`); without it the legacy hitscan applies. */
    firearm: firearmSchema.optional(),
    ammunition: ammunitionSchema.optional(),
    recoil: recoilSchema.optional(),
    casing: casingSchema.optional(),
    /** Citations for the numbers above, by key. */
    sources: z.record(z.string(), z.string().min(1).max(600)).optional(),
    /** Values without a source, each marked `TODO(unverified)`. */
    unverified: z
      .array(
        z
          .string()
          .regex(/^TODO\(unverified\)/)
          .max(400),
      )
      .optional(),
  })
  .strict()
  .refine((preset) => preset.body || preset.model, { message: 'body or model is required' })

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
