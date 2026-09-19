/**
 * Minimal type stubs for kind modules.
 *
 * These types are referenced by kindCapability.ts and kindProps.ts.
 * The full roomPaint types (OfficeWorld, RoomEntity, etc.) are Vue/Agency-specific
 * and not ported. Only the interface shapes needed for capability matching are here.
 */

/** Mesh reference — URL, builtin name, or hi-res key. */
export interface StageMeshRef {
  url?: string
  builtin?: string
  hi_res?: string
}

/** Image reference for box faces. */
export interface StageImageRef {
  url?: string
  photoId?: string
  builtin?: string
}
