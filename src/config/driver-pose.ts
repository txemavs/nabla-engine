/** Chassis-local metre offsets. The view offset is additional to the adjusted head. */
export interface DriverPoseAdjustment {
  head: [number, number, number]
  view: [number, number, number]
}
export const driverPoseRange = { min: -1, max: 1, step: 0.01 } as const
export const DRIVER_POSE_STORAGE_KEY = 'nabla.driverPose'
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
export function normalizeDriverPose(value: unknown): DriverPoseAdjustment {
  const raw = value && typeof value === 'object' ? (value as Partial<DriverPoseAdjustment>) : {}
  const vector = (v: unknown): [number, number, number] =>
    [0, 1, 2].map((i) => {
      const n = Array.isArray(v) ? v[i] : 0
      return typeof n === 'number' && Number.isFinite(n)
        ? Math.max(driverPoseRange.min, Math.min(driverPoseRange.max, n))
        : 0
    }) as [number, number, number]
  return { head: vector(raw.head), view: vector(raw.view) }
}
function saved(storage?: StorageLike): Record<string, DriverPoseAdjustment> {
  try {
    const value = JSON.parse(storage?.getItem(DRIVER_POSE_STORAGE_KEY) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}
export function readDriverPose(
  storage: StorageLike | undefined,
  model: string,
): DriverPoseAdjustment {
  return normalizeDriverPose(saved(storage)[model])
}
export function writeDriverPose(
  storage: StorageLike | undefined,
  model: string,
  value?: DriverPoseAdjustment,
): void {
  try {
    const values = saved(storage)
    if (value) values[model] = normalizeDriverPose(value)
    else delete values[model]
    storage?.setItem(DRIVER_POSE_STORAGE_KEY, JSON.stringify(values))
  } catch {
    /* Session adjustments still work without storage. */
  }
}
