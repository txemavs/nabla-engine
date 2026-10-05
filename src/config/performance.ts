/** Quality defaults, supported choices and named rendering/streaming presets. */
export interface PerformanceSettings {
  /** Named quality profile, or custom for explicit values. */
  preset: string
  /** Enable vehicle shadows: 0 off, 1 on. */
  vehicleShadows: number
  /** Enable vehicle mirrors: 0 off, 1 on. */
  mirrors: number
  /** Road draw distance, metres. */
  roads: number
  /** Enable streamed buildings: 0 off, 1 on. */
  buildings: number
  /** Terrain draw distance, metres. */
  distance: number
  /** Horizontal distance where every drawn thing fades out. */
  fog: number
  /** Terrain mesh detail selection; one of the supported relief levels. */
  relief: number
  /** Terrain collision radius, metres. */
  collisions: number
  /** Maximum device pixel ratio; larger values increase GPU cost. */
  resolution: number
  /** Shadow quality key; see shadows.ts for cascade settings. */
  shadows: number
  /** 0 off, 1 slight far-field blur. Presets reset it to off. */
  dof: number
}

export { shadowTiers, type ShadowTier } from './shadows.js'

export const performanceDefaults: Readonly<PerformanceSettings> = Object.freeze({
  preset: 'balanced',
  vehicleShadows: 0,
  mirrors: 1,
  roads: 1000,
  buildings: 1,
  distance: 4000,
  fog: 2000,
  relief: 2,
  collisions: 400,
  resolution: 1.25,
  shadows: 512,
  dof: 0,
})

/** Standalone browser-game profile; explicit host settings override these values. */
export const browserPerformanceDefaults: Readonly<PerformanceSettings> = Object.freeze({
  ...performanceDefaults,
  preset: 'custom',
  resolution: 2,
  shadows: 2048,
  fog: 4000,
})

/** Validate serialized settings against supported quality choices; return an independent copy. */
export function normalizePerformance(value: unknown): PerformanceSettings {
  try {
    const s = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    const choose = (value: unknown, allowed: number[], fallback: number) =>
      typeof value === 'number' && allowed.includes(value) ? value : fallback
    return {
      preset:
        typeof s.preset === 'string' && Object.hasOwn(performancePresets, s.preset)
          ? s.preset
          : 'custom',
      vehicleShadows: choose(s.vehicleShadows, [0, 1], performanceDefaults.vehicleShadows),
      mirrors: choose(s.mirrors, [0, 1], performanceDefaults.mirrors),
      roads: choose(
        s.roads,
        [0, 250, 500, 1000, 2000, 4000, 6000, 20000],
        performanceDefaults.roads,
      ),
      buildings: choose(s.buildings, [0, 1], performanceDefaults.buildings),
      distance: choose(
        s.distance,
        [1000, 2000, 4000, 6000, 10000, 20000],
        performanceDefaults.distance,
      ),
      fog: choose(
        s.fog,
        [500, 1000, 2000, 4000, 8000, 16000],
        typeof s.preset === 'string' && Object.hasOwn(performancePresets, s.preset)
          ? performancePresets[s.preset as keyof typeof performancePresets].settings.fog
          : performanceDefaults.fog,
      ),
      relief: choose(s.relief, [2, 4, 8, 12], performanceDefaults.relief),
      collisions: choose(s.collisions, [200, 400, 800, 2000], performanceDefaults.collisions),
      resolution: choose(
        s.resolution,
        [0.35, 0.5, 0.75, 1, 1.25, 2],
        performanceDefaults.resolution,
      ),
      shadows: choose(s.shadows, [0, 512, 1024, 2048, 4096], performanceDefaults.shadows),
      dof: choose(s.dof, [0, 1], performanceDefaults.dof),
    }
  } catch {
    return { ...performanceDefaults }
  }
}

export const performancePresets = {
  minimal: {
    label: 'Mínimo',
    settings: {
      vehicleShadows: 0,
      mirrors: 0,
      dof: 0,
      roads: 250,
      buildings: 0,
      distance: 1000,
      fog: 500,
      relief: 2,
      collisions: 200,
      resolution: 0.35,
      shadows: 0,
    },
    cache: 25,
    concurrent: 1,
    ahead: 0,
    tiles: 12,
  },
  mobile: {
    label: 'Móvil básico',
    settings: {
      vehicleShadows: 0,
      mirrors: 0,
      dof: 0,
      roads: 250,
      buildings: 0,
      distance: 1000,
      fog: 500,
      relief: 2,
      collisions: 200,
      resolution: 0.5,
      shadows: 0,
    },
    cache: 25,
    concurrent: 1,
    ahead: 0,
    tiles: 12,
  },
  low: {
    label: 'Bajo',
    settings: {
      vehicleShadows: 0,
      mirrors: 1,
      dof: 0,
      roads: 500,
      buildings: 1,
      distance: 2000,
      fog: 1000,
      relief: 2,
      collisions: 200,
      resolution: 1,
      shadows: 512,
    },
    cache: 50,
    concurrent: 1,
    ahead: 15,
    tiles: 24,
  },
  balanced: {
    label: 'Equilibrado',
    settings: {
      vehicleShadows: 0,
      mirrors: 1,
      dof: 0,
      roads: 1000,
      buildings: 1,
      distance: 4000,
      fog: 2000,
      relief: 2,
      collisions: 400,
      resolution: 1.25,
      shadows: 512,
    },
    cache: 100,
    concurrent: 2,
    ahead: 30,
    tiles: 64,
  },
  high: {
    label: 'Alto',
    settings: {
      vehicleShadows: 0,
      mirrors: 1,
      dof: 0,
      roads: 4000,
      buildings: 1,
      distance: 20000,
      fog: 4000,
      relief: 8,
      collisions: 800,
      resolution: 1.25,
      shadows: 1024,
    },
    cache: 100,
    concurrent: 3,
    ahead: 45,
    tiles: 160,
  },
  ultra: {
    label: 'Ultra',
    settings: {
      vehicleShadows: 0,
      mirrors: 1,
      dof: 0,
      roads: 20000,
      buildings: 1,
      distance: 20000,
      fog: 8000,
      relief: 8,
      collisions: 800,
      resolution: 2,
      shadows: 2048,
    },
    cache: 100,
    concurrent: 3,
    ahead: 45,
    tiles: 240,
  },
} as const

/** Cloud renderer for a named quality preset. Artistic 3-layer sheets only on Ultra; all other tiers use the cheaper globe layer. */
export function cloudStyleForPerformancePreset(preset: string): 'low' | 'artistic' {
  return preset === 'ultra' ? 'artistic' : 'low'
}

/** z15 meshes for a custom draw distance. Named presets carry their own cap. */
export function tileBudget(distance: number): number {
  if (distance <= 1000) return 12
  if (distance <= 2000) return 24
  if (distance <= 4000) return 64
  if (distance <= 6000) return 96
  if (distance <= 10000) return 140
  return 240
}
export function streamBudget(settings: PerformanceSettings) {
  const named = performancePresets[settings.preset as keyof typeof performancePresets]
  const profile = named ?? performanceProfile(settings)
  return {
    concurrent: profile.concurrent,
    ahead: profile.ahead,
    retain: settings.preset === 'ultra',
    tiles: named?.tiles ?? tileBudget(settings.distance),
  }
}
export function performanceProfile(settings: PerformanceSettings) {
  return (
    performancePresets[settings.preset as keyof typeof performancePresets] ??
    (settings.distance >= 20000
      ? performancePresets.ultra
      : settings.distance >= 10000
        ? performancePresets.high
        : performancePresets.balanced)
  )
}
