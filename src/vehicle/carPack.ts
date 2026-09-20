/**
 * Car pack interface — defines what a car-specific data folder must export.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/vehicle/carPack.ts
 *
 * Each car pack provides geometry constants (hub positions, wheelbase) and
 * body-space mounts (eye, avatar, steering). Shared drive/sim/render logic
 * consumes these via the pack interface.
 *
 * To add a new car:
 * 1. Create a folder under `src/packs/<car-id>/` (kebab-case).
 * 2. Export a `CarPack` from `index.ts` with the car's specific values.
 * 3. Register it in `resolveCarPack()` below.
 *
 * See `a3cabrio/README.md` for frame conventions and visual-wheel lessons.
 */
import type { StageMeshRef } from '../kind/types.js'

export interface CarPackMounts {
  /** 1P eye position in body space (driver's head height). */
  eye1p: { x: number; y: number; z: number }
  /** Avatar (monitorcito) position in body space — at the driver seat headrest. */
  avatar: { x: number; y: number; z: number }
  /** Height for chase/far/top focus point (body Y offset). */
  focusHeight: number
  /** Steering wheel mount, or undefined if no steering (e.g. hull). */
  steering?: {
    /** Column/hub center X in body space. */
    x: number
    /** Column/hub center Y in body space. */
    y: number
    /** Column/hub center Z in body space. */
    z: number
    /** Rest orientation: tilt back from vertical (degrees around local X). */
    restPitch: number
    /** Steering wheel mesh ref. */
    mesh: StageMeshRef
  }
}

export interface CarPackHubs {
  /** Hub Y in the wheel GLB's local space. */
  hubY: number
  /** Front axle to rear axle distance. */
  wheelbase: number
  /** Front track width (left-right hub distance). */
  trackFront: number
  /** Rear track width (left-right hub distance). */
  trackRear: number
  /**
   * Visual suspension travel limit (metres).
   * Wheels stay grounded until body lifts/drops beyond this travel.
   * Typical road car: 0.12–0.18 m. If omitted, defaults to 0.15 m.
   */
  visualTravel?: number
}

export interface CarPackWheelPositions {
  FL: { x: number; y: number; z: number }
  FR: { x: number; y: number; z: number }
  RL: { x: number; y: number; z: number }
  RR: { x: number; y: number; z: number }
}

/** Authored GLB origin -> Engine model space (Y=0 = ground contact, +Z forward). */
export interface MeshAlign {
  x: number
  y: number
  z: number
  /** Degrees about +Y. */
  yawDeg: number
}

export const IDENTITY_MESH_ALIGN: MeshAlign = { x: 0, y: 0, z: 0, yawDeg: 0 }

export interface CarPackAssets {
  /** Body GLB URL. */
  body: StageMeshRef
  /** Wheel GLB URL. */
  wheel: StageMeshRef
  /** Steering wheel GLB URL (if applicable). */
  steering?: StageMeshRef
}

export interface CarPack {
  /** Unique identifier for this pack (e.g. 'a3cabrio'). */
  id: string
  /** Entity ID prefix this pack matches (e.g. 'world.car.audi.a3.'). */
  entityPrefix: string
  /** Body-space mounts for 1P camera, avatar, steering. */
  mounts: CarPackMounts
  /** Wheel hub geometry constants. */
  hubs: CarPackHubs
  /** Asset references for body/wheel/steering meshes. */
  assets: CarPackAssets
  /**
   * How this car GLB sits in model space.
   * If the authored origin is already correct: IDENTITY_MESH_ALIGN.
   * If not: set offset + yawDeg once -- that is the whole adaptation.
   */
  meshAlign: MeshAlign
  /** Compute wheel hub positions in model space from hub constants. */
  wheelPositions(): CarPackWheelPositions
}

/**
 * Check if an entity ID matches this car pack.
 */
export function matchesCarPack(pack: CarPack, entityId: string): boolean {
  return entityId.startsWith(pack.entityPrefix)
}
