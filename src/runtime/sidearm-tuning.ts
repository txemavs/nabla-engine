/** Eye-relative aimed pistol pose, adjustable live and saved per browser. */
export interface SidearmTuning {
  /** Vertical position in metres. */
  height: number
  /** Muzzle-up angle in degrees. */
  angle: number
}
export { sidearmTuningDefaults, sidearmTuningRanges } from '../config/gameplay-tuning.js'
import { sidearmTuningDefaults, sidearmTuningRanges } from '../config/gameplay-tuning.js'
const storageKey = 'nabla.sidearmTuning'
type TuningStorage = Pick<Storage, 'getItem' | 'setItem'>
export function normalizeSidearmTuning(
  patch: Partial<SidearmTuning>,
  base = sidearmTuningDefaults,
): SidearmTuning {
  const result = { ...base }
  for (const key of ['height', 'angle'] as const) {
    const value = patch?.[key]
    if (typeof value === 'number' && Number.isFinite(value))
      result[key] = Math.min(
        sidearmTuningRanges[key][1],
        Math.max(sidearmTuningRanges[key][0], value),
      )
  }
  return result
}
export function readSidearmTuning(storage?: TuningStorage): SidearmTuning {
  try {
    return normalizeSidearmTuning(JSON.parse(storage?.getItem(storageKey) ?? '{}'))
  } catch {
    return { ...sidearmTuningDefaults }
  }
}
export function writeSidearmTuning(
  storage: TuningStorage | undefined,
  tuning: SidearmTuning,
): void {
  try {
    storage?.setItem(storageKey, JSON.stringify(tuning))
  } catch {
    /* Storage may be disabled. */
  }
}
