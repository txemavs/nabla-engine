export const weaponPoseNames = {
  normal: 'Normal',
  aimed: 'Apuntando',
  inspect: 'Z · mirar',
  inspectAimed: 'Z · mirando y apuntando',
  chamber: 'X · recámara',
  chamberAimed: 'X · recámara y apuntando',
} as const
export type WeaponPose = keyof typeof weaponPoseNames
export type WeaponAngles = { pitch: number; yaw: number; roll: number }
export type WeaponPoseTuning = Record<WeaponPose, WeaponAngles>
export const weaponPoseDefaults: WeaponPoseTuning = {
  normal: { pitch: 0, yaw: 0, roll: 0 },
  aimed: { pitch: 0, yaw: 0, roll: 0 },
  inspect: { pitch: 11.2, yaw: -41, roll: -26.6 },
  inspectAimed: { pitch: 29.6, yaw: -19.8, roll: -47.2 },
  chamber: { pitch: 48, yaw: -17.5, roll: 27.1 },
  chamberAimed: { pitch: 63, yaw: -22.2, roll: 12.7 },
}
export function normalizeWeaponPoses(value: Partial<WeaponPoseTuning> = {}): WeaponPoseTuning {
  const result = {} as WeaponPoseTuning
  for (const key of Object.keys(weaponPoseNames) as WeaponPose[]) {
    result[key] = { ...weaponPoseDefaults[key] }
    for (const axis of ['pitch', 'yaw', 'roll'] as const) {
      const n = value?.[key]?.[axis]
      if (typeof n === 'number' && Number.isFinite(n))
        result[key][axis] = Math.max(-180, Math.min(180, n))
    }
  }
  return result
}
