export interface PerformanceSettings {
  preset: string
  roads: number
  buildings: number
  distance: number
  /** Horizontal distance where every drawn thing fades out. */
  fog: number
  relief: number
  collisions: number
  resolution: number
  shadows: number
  /** 0 off, 1 slight far-field blur. Quality presets do not change it. */
  dof: number
}

export { shadowTiers, type ShadowTier } from '../src/render/shadow-tiers.js'

export const performanceDefaults: PerformanceSettings = {
  preset: 'balanced',
  roads: 1000,
  buildings: 1,
  distance: 4000,
  fog: 2000,
  relief: 2,
  collisions: 400,
  resolution: 1.25,
  shadows: 512,
  dof: 1,
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
      fog: choose(
        s.fog,
        [500, 1000, 2000, 4000, 8000, 16000],
        typeof s.preset === 'string' && s.preset in performancePresets
          ? performancePresets[s.preset as keyof typeof performancePresets].settings.fog
          : 2000,
      ),
      relief: choose(s.relief, [2, 4, 8, 12], 2),
      collisions: choose(s.collisions, [200, 400, 800, 2000], 400),
      resolution: choose(s.resolution, [0.75, 1, 1.25, 2], 1.25),
      shadows: choose(s.shadows, [0, 512, 1024, 2048, 4096], 512),
      dof: choose(s.dof, [0, 1], 1),
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
      fog: 500,
      relief: 2,
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
      fog: 1000,
      relief: 2,
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
      fog: 2000,
      relief: 2,
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
  },
  ultra: {
    label: 'Ultra',
    settings: {
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
