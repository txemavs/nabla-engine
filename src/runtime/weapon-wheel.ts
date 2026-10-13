/** Player comfort preferences, separate from weapon calibration and authored poses. */
export interface WeaponWheelSettings {
  /** 0: right hand, 11: left hand (12 positions including both endpoints). */
  hand: number
  /** 0: close to the eye, 1: arm extended. */
  distance: number
}
export function normalizeWeaponWheel(
  value: Partial<WeaponWheelSettings> | null = {},
): WeaponWheelSettings {
  const finite = (n: unknown, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return {
    hand: Math.round(Math.max(0, Math.min(11, finite(value?.hand, 0)))),
    distance: Math.max(0, Math.min(1, finite(value?.distance, 0))),
  }
}
export function stepWeaponWheel(
  value: WeaponWheelSettings,
  aiming: boolean,
  delta: number,
): WeaponWheelSettings {
  const next = normalizeWeaponWheel(value)
  if (!Number.isFinite(delta) || delta === 0) return next
  if (aiming) next.distance = Math.round((next.distance + Math.sign(delta) * 0.05) * 20) / 20
  else next.hand += Math.sign(delta)
  return normalizeWeaponWheel(next)
}
/** Metres relative to the calibrated weapon pose. Aiming always returns to the sight line. */
export function weaponWheelOffset(
  value: WeaponWheelSettings,
  aim: number,
  slideBlend = 0,
): { x: number; z: number } {
  return {
    x: ((-0.2 * value.hand) / 11) * (1 - aim),
    z: -0.3 * value.distance * aim * (1 - Math.max(0, Math.min(1, slideBlend))),
  }
}
export function weaponWheelTunnel(distance: number): number {
  return 1 - 0.75 * Math.max(0, Math.min(1, distance))
}
