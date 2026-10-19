/**
 * Bullet-impact sounds by surface kind. A surface kind is a property of what was hit (a body, a
 * scenery layer, an instanced mesh), never of a model: vehicles, road signs and traffic-light
 * poles say "metal", and this table says how each kind rings. Add a kind here, tag the surface,
 * and the shot path plays it; nothing else changes.
 *
 * The sound itself is the engine's procedural metal strike (`src/audio/metal-impact.ts`): no
 * audio asset is shipped for it. `pitch`, `level` and `decay` shift that strike per surface; the
 * strike adds its own small random pitch, level and timbre variation on every hit.
 */
export type ImpactSurface = 'metal-body' | 'metal-sign'

export interface ImpactSound {
  /** Pitch multiplier on the strike's resonances (1 = the vehicle-body clang). */
  pitch: number
  /** Level multiplier (1 = the vehicle-body clang). */
  level: number
  /** Ring-out multiplier (1 = the vehicle-body clang; thin sheet metal rings shorter). */
  decay: number
  /** Shortest time between two sounds of this surface, seconds. Faster hits are dropped. */
  minInterval: number
}

export const impactSounds: Readonly<Record<ImpactSurface, ImpactSound>> = Object.freeze({
  /** Large vehicle panels: the original clang, unchanged. */
  'metal-body': { pitch: 1, level: 1, decay: 1, minInterval: 0.04 },
  /** Road signs and traffic-light poles: a higher, thinner and shorter ping. */
  'metal-sign': { pitch: 1.5, level: 0.85, decay: 0.7, minInterval: 0.06 },
})

/** Surface a vehicle body presents to a shot. */
export const vehicleImpactSurface: ImpactSurface = 'metal-body'

/** Surface of scenery that hosts hand-handle (instanced signs) unless the mesh says otherwise. */
export const sceneryImpactSurface: ImpactSurface = 'metal-sign'

export function isImpactSurface(value: unknown): value is ImpactSurface {
  return typeof value === 'string' && Object.hasOwn(impactSounds, value)
}
