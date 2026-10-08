/**
 * Per-vehicle sound options, resolved from a preset's optional `vehicle.audio` block.
 * Omitted fields keep the road-car behaviour: turbo on, clack on audible gear changes, the
 * road-car engine note.
 */
import { v4EngineDefaults, v4FiringAngles } from './v4-engine.js'

export type GearShiftSoundKind = 'clack' | 'click' | 'none'
/** `note`: the road-car engine note. `v4`: the procedural V4 voice (`audio/v4-engine.ts`). */
export type EngineVoiceKind = 'note' | 'v4'

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
  engine?: {
    voice: EngineVoiceKind
    /** V4: angle between the cylinder banks, degrees. Default 90. */
    vAngle?: number
    /** V4: angle between the two crankpins, degrees. Default 180. */
    crankpin?: number
    /** Loudness multiplier, 0..2. Default 1. */
    volume?: number
  }
}

/** Resolved engine voice: the kind, the firing angles of a V4 (empty for `note`), the volume. */
export interface ResolvedEngineVoice {
  voice: EngineVoiceKind
  firing: number[]
  volume: number
}

export interface ResolvedVehicleSound {
  turbo: boolean
  gearShift: GearShiftSoundKind
  gearShiftVolume: number
  engine: ResolvedEngineVoice
}

const volumeOf = (volume: unknown) =>
  typeof volume === 'number' && Number.isFinite(volume) ? Math.min(2, Math.max(0, volume)) : 1

/** Resolve the engine voice of `vehicle.audio.engine`; omitted = the road-car note. */
export function resolveEngineVoice(
  engine?: VehicleSoundOptions['engine'] | null,
): ResolvedEngineVoice {
  if (engine?.voice !== 'v4') return { voice: 'note', firing: [], volume: volumeOf(engine?.volume) }
  return {
    voice: 'v4',
    firing: v4FiringAngles(
      engine.vAngle ?? v4EngineDefaults.vAngle,
      engine.crankpin ?? v4EngineDefaults.crankpin,
    ),
    volume: volumeOf(engine.volume),
  }
}

export function resolveVehicleSound(options?: VehicleSoundOptions | null): ResolvedVehicleSound {
  return {
    turbo: options?.turbo ?? true,
    gearShift: options?.gearShift?.sound ?? 'clack',
    gearShiftVolume: volumeOf(options?.gearShift?.volume),
    engine: resolveEngineVoice(options?.engine),
  }
}
