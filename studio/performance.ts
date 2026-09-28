export interface PerformanceSettings {
  preset: string
  vehicleShadows: number
  mirrors: number
  roads: number
  buildings: number
  distance: number
  /** Horizontal distance where every drawn thing fades out. */
  fog: number
  relief: number
  collisions: number
  resolution: number
  shadows: number
  /** 0 off, 1 slight far-field blur. Presets reset it to off. */
  dof: number
}

export { shadowTiers, type ShadowTier } from '../src/render/shadow-tiers.js'

export const performanceDefaults: PerformanceSettings = {
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
}
export function readPerformance(): PerformanceSettings {
  try {
    const stored = localStorage.getItem('nabla.performance.v1')
    if (!stored && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
      return { ...performanceDefaults, ...performancePresets.mobile.settings, preset: 'mobile' }
    const s = JSON.parse(stored ?? '{}')
    const choose = (value: number, allowed: number[], fallback: number) =>
      allowed.includes(value) ? value : fallback
    return {
      preset: typeof s.preset === 'string' && s.preset in performancePresets ? s.preset : 'custom',
      vehicleShadows: choose(s.vehicleShadows, [0, 1], 0),
      mirrors: choose(s.mirrors, [0, 1], 1),
      roads: choose(s.roads, [0, 250, 500, 1000, 2000, 4000, 6000, 20000], 1000),
      buildings: choose(s.buildings, [0, 1], 1),
      distance: choose(s.distance, [1000, 2000, 4000, 6000, 10000, 20000], 4000),
      fog: choose(
        s.fog,
        [500, 1000, 2000, 4000, 8000, 16000],
        typeof s.preset === 'string' && s.preset in performancePresets
          ? performancePresets[s.preset as keyof typeof performancePresets].settings.fog
          : 2000,
      ),
      relief: choose(s.relief, [2, 4, 8, 12], 2),
      collisions: choose(s.collisions, [200, 400, 800, 2000], 400),
      resolution: choose(s.resolution, [0.35, 0.5, 0.75, 1, 1.25, 2], 1.25),
      shadows: choose(s.shadows, [0, 512, 1024, 2048, 4096], 512),
      dof: choose(s.dof, [0, 1], 0),
    }
  } catch {
    return { ...performanceDefaults }
  }
}

export const performancePresets = {
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
