import {
  readSidearmTuning,
  normalizeSidearmTuning,
  writeSidearmTuning,
  type SidearmTuning,
} from './sidearm-tuning.js'
import { normalizeWeaponWheel, stepWeaponWheel } from './weapon-wheel.js'
import {
  normalizeWeaponPoses,
  weaponPoseStorageKey,
  type WeaponPoseTuning,
} from './weapon-pose-tuning.js'
import type { Sidearm } from './sidearm.js'

type Weapon = Pick<Sidearm, 'preset' | 'rigPoses'> | null | undefined
type FlashSettings = { x: number; y: number; z: number; intensity: number }
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Instance-owned weapon preferences, independent of combat, input and model lifecycles. */
export class RuntimeWeaponPreferences {
  tuning: SidearmTuning
  wheel: ReturnType<typeof normalizeWeaponWheel>
  readonly flash: FlashSettings = { x: 0, y: 0, z: -72, intensity: 100 }
  private readonly legacy: WeaponPoseTuning
  private readonly poses = new Map<string, WeaponPoseTuning>()

  constructor(private readonly storage?: PreferenceStorage) {
    this.tuning = readSidearmTuning(storage)
    try {
      this.wheel = normalizeWeaponWheel(JSON.parse(storage?.getItem('nabla.weaponWheel') ?? '{}'))
    } catch {
      this.wheel = normalizeWeaponWheel()
    }
    try {
      this.legacy = normalizeWeaponPoses(JSON.parse(storage?.getItem('nabla.weaponPoses') ?? '{}'))
    } catch {
      this.legacy = normalizeWeaponPoses()
    }
    try {
      this.normalizeFlash(JSON.parse(storage?.getItem('nabla.muzzleFlash') ?? '{}'))
    } catch {
      /* Optional preference. */
    }
  }

  baseline(weapon: Weapon): WeaponPoseTuning {
    return weapon?.rigPoses ? normalizeWeaponPoses(weapon.rigPoses, this.legacy) : this.legacy
  }

  resolvePoses(weapon: Weapon): WeaponPoseTuning {
    const id = weapon?.preset?.id
    if (!id) return this.legacy
    const cached = this.poses.get(id)
    if (cached) return cached
    const base = this.baseline(weapon)
    let result = base
    try {
      const saved = this.storage?.getItem(weaponPoseStorageKey(id))
      if (saved) result = normalizeWeaponPoses(JSON.parse(saved), base)
    } catch {
      /* Optional persistence. */
    }
    // A missing rig is still loading; do not freeze its provisional fallback.
    if (weapon.rigPoses !== undefined) this.poses.set(id, result)
    return result
  }

  setPoses(
    value: WeaponPoseTuning,
    weapon: Weapon,
    apply: (poses: WeaponPoseTuning) => void,
  ): void {
    const id = weapon?.preset?.id
    const poses = normalizeWeaponPoses(value, id ? this.baseline(weapon) : undefined)
    if (id) this.poses.set(id, poses)
    else Object.assign(this.legacy, poses)
    apply(poses)
    this.remember(id ? weaponPoseStorageKey(id) : 'nabla.weaponPoses', poses)
  }

  setTuning(patch: Partial<SidearmTuning>, apply: (tuning: SidearmTuning) => void): void {
    this.tuning = normalizeSidearmTuning(patch, this.tuning)
    apply(this.tuning)
    writeSidearmTuning(this.storage, this.tuning)
  }

  resetWheel(): void {
    this.wheel = normalizeWeaponWheel()
    this.remember('nabla.weaponWheel', this.wheel)
  }

  stepWheel(
    aiming: boolean,
    delta: number,
    apply: (wheel: ReturnType<typeof normalizeWeaponWheel>) => void,
  ): void {
    this.wheel = stepWeaponWheel(this.wheel, aiming, delta)
    apply(this.wheel)
    this.remember('nabla.weaponWheel', this.wheel)
  }

  setFlash(value: Partial<FlashSettings>, apply: (flash: FlashSettings) => void): void {
    this.normalizeFlash(value)
    apply({ ...this.flash })
    this.remember('nabla.muzzleFlash', this.flash)
  }

  private normalizeFlash(value: Partial<FlashSettings> | null): void {
    for (const key of ['x', 'y', 'z', 'intensity'] as const) {
      const n = value?.[key]
      if (typeof n === 'number' && Number.isFinite(n))
        this.flash[key] = Math.max(
          key === 'intensity' ? 0 : -200,
          Math.min(key === 'intensity' ? 300 : 200, n),
        )
    }
  }

  private remember(key: string, value: unknown): void {
    try {
      this.storage?.setItem(key, JSON.stringify(value))
    } catch {
      /* Live preferences survive unavailable persistence. */
    }
  }
}
