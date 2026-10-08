/**
 * Per-vehicle sound options, resolved from a preset's optional `vehicle.audio` block.
 * Omitted fields keep the road-car behaviour: turbo on, clack on audible gear changes, the
 * road-car engine note.
 */
import { v4EngineDefaults, v4FiringAngles } from './v4-engine.js'
import { inlineEngineDefaults, inlineFiringAngles, inlinePulseWeights } from './inline-engine.js'

export type GearShiftSoundKind = 'clack' | 'click' | 'none'
/**
 * `note`: the road-car engine note. `v4`: the procedural V4 voice (`audio/v4-engine.ts`).
 * `inline`: the refined inline-4 turbo (or inline-5) voice (`audio/inline-engine.ts`).
 * `diesel`: the inline-6 turbo-diesel (`audio/diesel-engine.ts`), with a jake bark and air-brake hiss.
 */
export type EngineVoiceKind = 'note' | 'v4' | 'inline' | 'diesel'

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
  engine?: EngineVoiceOptions
  /** Voice per engine mode (`powertrain.modes`); the active mode's voice replaces `engine`. */
  engineModes?: { normal?: EngineVoiceOptions; beast?: EngineVoiceOptions }
}

/** Authored engine voice (`vehicle.audio.engine`). */
export interface EngineVoiceOptions {
  voice: EngineVoiceKind
  /** V4: angle between the cylinder banks, degrees. Default 90. */
  vAngle?: number
  /** V4: angle between the two crankpins, degrees. Default 180. */
  crankpin?: number
  /** Inline: number of cylinders. Default 4; 5 gives the five-cylinder warble. */
  cylinders?: number
  /** Inline-5: pulse-strength spread for the warble, 0..0.5. Default 0.12. */
  warble?: number
  /** Inline: turbo whistle and blow-off multipliers, 0..2. Defaults 0.5 and 0.12. */
  turboWhistle?: number
  blowOff?: number
  /** Inline: chance (0..1) of a soft overrun burble when the throttle closes at high rpm. */
  burble?: number
  /** Diesel: exhaust-brake bark on lift-off. Default true for `diesel`. */
  jake?: boolean
  /** Diesel: air-brake hiss when the service brake changes. Default true for `diesel`. */
  airBrake?: boolean
  /** Loudness multiplier, 0..2. Default 1. */
  volume?: number
}

/** Resolved engine voice: the kind, the firing angles of a V4 (empty for `note`), the volume. */
export interface ResolvedEngineVoice {
  voice: EngineVoiceKind
  firing: number[]
  volume: number
  /** Inline: pulse strength per firing (warble). */
  weights?: number[]
  /** Turbo whistle and blow-off multipliers (inline only; others use 1). */
  turboWhistle?: number
  blowOff?: number
  /** Inline: overrun burble chance per high-rpm lift, 0..1 (0 = never). */
  burble?: number
  /** Diesel: jake bark and air-brake hiss. */
  jake?: boolean
  airBrake?: boolean
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
export function resolveEngineVoice(engine?: EngineVoiceOptions | null): ResolvedEngineVoice {
  if (engine?.voice === 'diesel') {
    const cylinders = 6
    return {
      voice: 'diesel',
      firing: inlineFiringAngles(cylinders),
      volume: volumeOf(engine.volume),
      weights: inlinePulseWeights(cylinders, 0),
      turboWhistle: volumeOf(engine.turboWhistle ?? 0.85),
      blowOff: volumeOf(engine.blowOff ?? 0.05),
      jake: engine.jake !== false,
      airBrake: engine.airBrake !== false,
    }
  }
  if (engine?.voice === 'inline') {
    const d = inlineEngineDefaults
    const cylinders =
      Number.isInteger(engine.cylinders) && engine.cylinders! >= 3 && engine.cylinders! <= 6
        ? engine.cylinders!
        : d.cylinders
    return {
      voice: 'inline',
      firing: inlineFiringAngles(cylinders),
      volume: volumeOf(engine.volume),
      weights: inlinePulseWeights(cylinders, engine.warble ?? d.warble),
      turboWhistle: volumeOf(engine.turboWhistle ?? d.turboWhistle),
      blowOff: volumeOf(engine.blowOff ?? d.blowOff),
      burble: Math.min(1, Math.max(0, engine.burble ?? 0)),
    }
  }
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

/**
 * Resolve `vehicle.audio`. `mode` is the vehicle's engine mode: when `engineModes[mode]` is set,
 * that voice replaces `engine` (the S3's calm Normal and five-cylinder Bestia).
 */
export function resolveVehicleSound(
  options?: VehicleSoundOptions | null,
  mode?: 'normal' | 'beast',
): ResolvedVehicleSound {
  return {
    turbo: options?.turbo ?? true,
    gearShift: options?.gearShift?.sound ?? 'clack',
    gearShiftVolume: volumeOf(options?.gearShift?.volume),
    engine: resolveEngineVoice((mode && options?.engineModes?.[mode]) || options?.engine),
  }
}
