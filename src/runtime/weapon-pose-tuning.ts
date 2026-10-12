export const weaponPoseNames = {
  slide: 'F · corredera',
  slideAimed: 'F · corredera apuntando',
  slideInspect: 'F + Z · corredera y seguro',
  slideInspectAimed: 'F + Z · apuntando',
  slideChamber: 'F + X · corredera y recámara',
  slideChamberAimed: 'F + X · apuntando',
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
export { weaponPoseDefaults } from '../config/gameplay-tuning.js'
import { weaponPoseDefaults } from '../config/gameplay-tuning.js'

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
