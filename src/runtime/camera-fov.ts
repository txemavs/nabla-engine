/**
 * Player field-of-view offset from the J menu. One offset in degrees widens or narrows both
 * the cockpit / on-foot eye (`firstPersonFov`) and the chase camera (`chaseFov`, which the
 * overhead view shares). The cinematic camera keeps its own FOV.
 */

/** Storage key of the saved offset. */
export const cameraFovStorageKey = 'nabla.cameraFov'
/** Degrees per menu step. */
export const cameraFovStep = 5
/** Allowed offset range, degrees. */
export const cameraFovRange = Object.freeze({ min: -15, max: 25 })
/** Offset before the player picks one (Txema 2026-10-10: +15°). */
export const cameraFovDefault = 15

export type CameraFovStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface CameraFovBase {
  firstPersonFov: number
  chaseFov: number
}

/** Clamp to the allowed range and whole degrees; non-finite reads as 0. */
export function clampCameraFovOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0
  return Math.max(cameraFovRange.min, Math.min(cameraFovRange.max, Math.round(offset)))
}

/** Both camera FOVs for an offset. */
export function cameraFovFor(base: CameraFovBase, offset: number): CameraFovBase {
  const delta = clampCameraFovOffset(offset)
  return { firstPersonFov: base.firstPersonFov + delta, chaseFov: base.chaseFov + delta }
}

/** Saved offset, or {@link cameraFovDefault} when none or unreadable. */
export function readCameraFovOffset(storage: CameraFovStorage | null | undefined): number {
  try {
    const raw = storage?.getItem(cameraFovStorageKey)
    return raw === null || raw === undefined ? cameraFovDefault : clampCameraFovOffset(Number(raw))
  } catch {
    return cameraFovDefault
  }
}

/** Remember the offset. Storage errors are ignored; the change still applies this session. */
export function writeCameraFovOffset(
  storage: CameraFovStorage | null | undefined,
  offset: number,
): void {
  try {
    storage?.setItem(cameraFovStorageKey, String(clampCameraFovOffset(offset)))
  } catch {
    // Private mode or a full quota.
  }
}

/** Offset after a menu action: a signed step, or `reset`. */
export function nextCameraFovOffset(current: number, action: string): number {
  if (action === 'reset') return cameraFovDefault
  return clampCameraFovOffset(current + Number(action))
}
