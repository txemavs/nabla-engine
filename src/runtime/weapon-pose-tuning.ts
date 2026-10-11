export const weaponPoseNames = {
  slide: 'F · corredera',
  slideAimed: 'F · corredera apuntando',
  normal: 'Normal',
  aimed: 'Apuntando',
  inspect: 'Z · mirar',
  inspectAimed: 'Z · mirando y apuntando',
  chamber: 'X · recámara',
  chamberAimed: 'X · recámara y apuntando',
} as const
export type WeaponPose = keyof typeof weaponPoseNames
export type WeaponAngles = {
  pitch: number
  yaw: number
  roll: number
  x: number
  y: number
  z: number
}
export type WeaponPoseTuning = Record<WeaponPose, WeaponAngles>
export const weaponPoseDefaults: WeaponPoseTuning = {
  slide: { pitch: 0, yaw: -33.9, roll: 91.2, x: -90.8, y: 0, z: 0 },
  slideAimed: { pitch: 4.5, yaw: -19.8, roll: 45.7, x: 16.6, y: 5.2, z: -375.8 },
  normal: { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 },
  aimed: { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 },
  inspect: { pitch: 11.2, yaw: -41, roll: -26.6, x: 0, y: 0, z: 0 },
  inspectAimed: { pitch: 29.6, yaw: -19.8, roll: -47.2, x: 0, y: 0, z: 0 },
  chamber: { pitch: 48, yaw: -17.5, roll: 27.1, x: 0, y: 0, z: 0 },
  chamberAimed: { pitch: 63, yaw: -22.2, roll: 12.7, x: 0, y: 0, z: 0 },
}
export function normalizeWeaponPoses(value: Partial<WeaponPoseTuning> = {}): WeaponPoseTuning {
  const result = {} as WeaponPoseTuning
  for (const key of Object.keys(weaponPoseNames) as WeaponPose[]) {
    result[key] = { ...weaponPoseDefaults[key] }
    for (const axis of ['pitch', 'yaw', 'roll', 'x', 'y', 'z'] as const) {
      const n = value?.[key]?.[axis]
      if (typeof n === 'number' && Number.isFinite(n))
        result[key][axis] = Math.max(
          -(['x', 'y', 'z'].includes(axis) ? 500 : 180),
          Math.min(['x', 'y', 'z'].includes(axis) ? 500 : 180, n),
        )
    }
  }
  return result
}
