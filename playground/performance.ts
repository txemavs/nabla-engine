export interface PerformanceSettings {
  preset: string
  roads: number
  buildings: number
  distance: number
  collisions: number
  resolution: number
  shadows: number
}

/** CSM configuration per quality tier. */
export interface ShadowTier {
  cascades: number
  mapSize: number
  maxFar: number
  /** Shadow blur radius for PCFSoftShadowMap (0 = hard edges). */
  radius: number
  /** Normal bias to reduce shadow acne on curved surfaces (metres). */
  normalBias: number
}

/** Mapping from shadow quality value to CSM configuration. */
export const shadowTiers: Record<number, ShadowTier | null> = {
  0: null, // disabled
  512: { cascades: 1, mapSize: 512, maxFar: 40, radius: 2.5, normalBias: 0.08 },
  1024: { cascades: 2, mapSize: 1024, maxFar: 200, radius: 2, normalBias: 0.06 },
  2048: { cascades: 3, mapSize: 2048, maxFar: 500, radius: 1.5, normalBias: 0.04 },
}

export const performanceDefaults: PerformanceSettings = {
  preset: 'balanced',
  roads: 1000,
  buildings: 1,
  distance: 4000,
  collisions: 400,
  resolution: 1.25,
  shadows: 512,
}
export function readPerformance(): PerformanceSettings {
  try {
    const s = JSON.parse(localStorage.getItem('nabla.performance.v1') ?? '{}')
    const choose = (value: number, allowed: number[], fallback: number) =>
      allowed.includes(value) ? value : fallback
    return {
      preset: typeof s.preset === 'string' && s.preset in performancePresets ? s.preset : 'custom',
      roads: choose(s.roads, [0, 250, 500, 1000, 2000, 4000, 6000, 20000], 1000),
      buildings: choose(s.buildings, [0, 1], 1),
      distance: choose(s.distance, [1000, 2000, 4000, 6000, 10000, 20000], 4000),
      collisions: choose(s.collisions, [200, 400, 800, 2000], 400),
      resolution: choose(s.resolution, [0.75, 1, 1.25, 2], 1.25),
      shadows: choose(s.shadows, [0, 512, 1024, 2048], 512),
    }
  } catch {
    return { ...performanceDefaults }
  }
}

export const performancePresets = {
  mobile: {
    label: 'Móvil básico',
    settings: {
      roads: 250,
      buildings: 0,
      distance: 1000,
      collisions: 200,
      resolution: 0.75,
      shadows: 0,
    },
    cache: 25,
    concurrent: 1,
    ahead: 0,
  },
  low: {
    label: 'Bajo',
    settings: {
      roads: 500,
      buildings: 1,
      distance: 2000,
      collisions: 200,
      resolution: 1,
      shadows: 512,
    },
    cache: 50,
    concurrent: 1,
    ahead: 15,
  },
  balanced: {
    label: 'Equilibrado',
    settings: {
      roads: 1000,
      buildings: 1,
      distance: 4000,
      collisions: 400,
      resolution: 1.25,
      shadows: 512,
    },
    cache: 100,
    concurrent: 2,
    ahead: 30,
  },
  high: {
    label: 'Alto',
    settings: {
      roads: 4000,
      buildings: 1,
      distance: 10000,
      collisions: 800,
      resolution: 1.25,
      shadows: 1024,
    },
    cache: 100,
    concurrent: 3,
    ahead: 45,
  },
  ultra: {
    label: 'Ultra',
    settings: {
      roads: 20000,
      buildings: 1,
      distance: 20000,
      collisions: 800,
      resolution: 2,
      shadows: 2048,
    },
    cache: 100,
    concurrent: 3,
    ahead: 45,
  },
} as const
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
