/**
 * Per-vehicle sound options, resolved from a preset's optional `vehicle.audio` block.
 * Omitted fields keep the road-car behaviour: turbo on, clack on audible gear changes.
 */
export type GearShiftSoundKind = 'clack' | 'click' | 'none'

/** Authored form, as in `vehicle.audio` of a preset (see `entity/vehicle/field.ts`). */
export interface VehicleSoundOptions {
  /** Turbo whistle, spool and blow-off on the engine note. Default true. */
  turbo?: boolean
  gearShift?: {
    /**
     * `clack` (default): the gearbox clack on audible changes only (D/R engagement, manual
     * shifts), shaped by `powertrain.shift.clack`. `click`: a short quiet click on every gear
     * change, automatic ones included. `none`: silent.
     */
    sound: GearShiftSoundKind
    /** Loudness multiplier, 0..2. Default 1. */
    volume?: number
  }
}

export interface ResolvedVehicleSound {
  turbo: boolean
  gearShift: GearShiftSoundKind
  gearShiftVolume: number
}

export function resolveVehicleSound(options?: VehicleSoundOptions | null): ResolvedVehicleSound {
  const volume = options?.gearShift?.volume
  return {
    turbo: options?.turbo ?? true,
    gearShift: options?.gearShift?.sound ?? 'clack',
    gearShiftVolume:
      typeof volume === 'number' && Number.isFinite(volume) ? Math.min(2, Math.max(0, volume)) : 1,
  }
}
