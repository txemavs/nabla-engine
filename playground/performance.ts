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
  /** Shadow sampling radius for Three.js r186 PCF filtering. */
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
  4096: { cascades: 4, mapSize: 4096, maxFar: 4000, radius: 1.2, normalBias: 0.03 },
}

/** Sentinel value for "A tope" shadow mode (distance = draw distance). */
export const SHADOW_MATCH_DISTANCE = -1

/** Template tier for "A tope" mode; maxFar is resolved at runtime from draw distance. */
const aTopeTierTemplate: ShadowTier = {
  cascades: 4,
  mapSize: 4096,
  maxFar: 0, // placeholder, resolved via resolveShadowTier
  radius: 1.2,
  normalBias: 0.03,
}

/**
 * Resolve the effective shadow tier for a given quality value and draw distance.
 * For the "A tope" sentinel (-1), maxFar is derived from the current draw distance (metres).
 */
export function resolveShadowTier(
  shadowsValue: number,
  drawDistanceMetres: number,
): ShadowTier | null {
  if (shadowsValue === SHADOW_MATCH_DISTANCE) {
    return { ...aTopeTierTemplate, maxFar: drawDistanceMetres }
  }
  return shadowTiers[shadowsValue] ?? null
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
      roads: choose(s.roads, [0, 250, 500, 1000, 2000, 4000, 6000, 20000, 50000], 1000),
      buildings: choose(s.buildings, [0, 1], 1),
      distance: choose(s.distance, [1000, 2000, 4000, 6000, 10000, 20000, 50000], 4000),
      collisions: choose(s.collisions, [200, 400, 800, 2000], 400),
      resolution: choose(s.resolution, [0.75, 1, 1.25, 2], 1.25),
      shadows: choose(s.shadows, [0, 512, 1024, 2048, 4096, SHADOW_MATCH_DISTANCE], 512),
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
  extreme: {
    label: 'Extremo · retención experimental 50 km',
    settings: {
      roads: 50000,
      buildings: 1,
      distance: 50000,
      collisions: 800,
      resolution: 2,
      shadows: 2048,
    },
    cache: 250,
    concurrent: 4,
    ahead: 60,
  },
} as const
export function performanceProfile(settings: PerformanceSettings) {
  return (
    performancePresets[settings.preset as keyof typeof performancePresets] ??
    (settings.distance >= 50000
      ? performancePresets.extreme
      : settings.distance >= 20000
        ? performancePresets.ultra
        : settings.distance >= 10000
          ? performancePresets.high
          : performancePresets.balanced)
  )
}
